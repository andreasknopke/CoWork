// Local-only workaround for deterministic conference drops around 70 seconds.
// This file is appended by the stock jitsi/web image to /config/config.js.

(function() {
    var INSTALL_GUARD = '__coworkLocalRecoveryInstalled';
    var INTERRUPTED_EVENT = 'conference.connectionInterrupted';
    var RESTORED_EVENT = 'conference.connectionRestored';
    var SKIP_PREJOIN_STORAGE_KEY = 'cowork-local-recovery-skip-prejoin';
    var SETTINGS = {
        rejoinMilliseconds: 55000,
        interruptGraceMilliseconds: 2500,
        rejoinTimeoutMilliseconds: 15000,
        minIntervalMilliseconds: 10000,
        reloadFallback: true
    };
    var state = {
        boundConference: null,
        joinedAt: 0,
        inFlight: false,
        lastAttemptAt: 0,
        preemptiveTimer: null,
        interruptTimer: null,
        watchdogTimer: null,
        onInterrupted: null,
        onRestored: null
    };

    if (window[INSTALL_GUARD]) {
        return;
    }

    window[INSTALL_GUARD] = true;

    config.prejoinConfig = config.prejoinConfig || {};

    try {
        if (window.sessionStorage.getItem(SKIP_PREJOIN_STORAGE_KEY) === '1') {
            config.prejoinConfig.enabled = false;
            window.sessionStorage.removeItem(SKIP_PREJOIN_STORAGE_KEY);
        }
    } catch (error) {}

    function log(level, message, extra) {
        if (!window.console || typeof window.console[level] !== 'function') {
            return;
        }

        if (typeof extra === 'undefined') {
            window.console[level]('[cowork-local-recovery] ' + message);
            return;
        }

        window.console[level]('[cowork-local-recovery] ' + message, extra);
    }

    function clearTimer(name) {
        if (!state[name]) {
            return;
        }

        window.clearTimeout(state[name]);
        state[name] = null;
    }

    function clearRecoveryTimers() {
        clearTimer('preemptiveTimer');
        clearTimer('interruptTimer');
        clearTimer('watchdogTimer');
    }

    function getApp() {
        return window.APP;
    }

    function getStore() {
        var app = getApp();

        return app && app.store;
    }

    function getJoinedConference() {
        var store = getStore();
        var appState;
        var conferenceState;

        if (!store || typeof store.getState !== 'function') {
            return null;
        }

        appState = store.getState();
        conferenceState = appState && appState['features/base/conference'];

        return conferenceState && conferenceState.conference;
    }

    function fallbackReload(reason) {
        if (!SETTINGS.reloadFallback) {
            state.inFlight = false;
            log('error', 'Silent rejoin failed and reload fallback is disabled (' + reason + ').');

            return;
        }

        state.inFlight = false;
        clearRecoveryTimers();

        try {
            window.sessionStorage.setItem(SKIP_PREJOIN_STORAGE_KEY, '1');
        } catch (error) {}

        log('warn', 'Reloading page as recovery fallback (' + reason + ').');
        window.setTimeout(function() {
            window.location.reload();
        }, 150);
    }

    function schedulePreemptiveRejoin(origin) {
        var delay;

        clearTimer('preemptiveTimer');

        if (!state.boundConference || state.inFlight) {
            return;
        }

        delay = SETTINGS.rejoinMilliseconds - (Date.now() - state.joinedAt);
        if (delay < 0) {
            delay = 0;
        }

        state.preemptiveTimer = window.setTimeout(function() {
            attemptSilentRejoin('timer');
        }, delay);

        log('info', 'Scheduled silent rejoin in ' + delay + ' ms (' + origin + ').');
    }

    function detachConference(conference) {
        if (!conference || typeof conference.off !== 'function') {
            return;
        }

        if (state.onInterrupted) {
            conference.off(INTERRUPTED_EVENT, state.onInterrupted);
        }

        if (state.onRestored) {
            conference.off(RESTORED_EVENT, state.onRestored);
        }
    }

    function getRejoinOptions() {
        var store = getStore();
        var appState = store && typeof store.getState === 'function' ? store.getState() : null;
        var mediaState = appState && appState['features/base/media'] ? appState['features/base/media'] : {};
        var audio = mediaState.audio || {};
        var video = mediaState.video || {};

        return {
            startWithAudioMuted: Boolean(audio.muted),
            startWithVideoMuted: Boolean(video.muted)
        };
    }

    function attemptSilentRejoin(reason) {
        var app = getApp();
        var conferenceController = app && app.conference;
        var now = Date.now();
        var roomName;
        var leavePromise;
        var rejoinOptions;

        if (state.inFlight) {
            return;
        }

        if (now - state.lastAttemptAt < SETTINGS.minIntervalMilliseconds) {
            log('warn', 'Skipping recovery attempt because the previous attempt was too recent (' + reason + ').');

            return;
        }

        if (!conferenceController
            || typeof conferenceController.leaveRoom !== 'function'
            || typeof conferenceController.joinRoom !== 'function') {
            fallbackReload('missing-controller-' + reason);

            return;
        }

        roomName = conferenceController.roomName;
        if (!roomName) {
            fallbackReload('missing-room-' + reason);

            return;
        }

        state.inFlight = true;
        state.lastAttemptAt = now;
        clearRecoveryTimers();
        rejoinOptions = getRejoinOptions();

        log('warn', 'Starting silent rejoin (' + reason + ').', rejoinOptions);

        state.watchdogTimer = window.setTimeout(function() {
            if (!state.inFlight) {
                return;
            }

            fallbackReload('watchdog-' + reason);
        }, SETTINGS.rejoinTimeoutMilliseconds);

        try {
            leavePromise = conferenceController.leaveRoom(false, 'local_recovery_' + reason);
        } catch (error) {
            leavePromise = Promise.reject(error);
        }

        Promise.resolve(leavePromise)
            .catch(function(error) {
                log('warn', 'leaveRoom(false) failed, continuing with joinRoom.', error);
            })
            .then(function() {
                return conferenceController.joinRoom(roomName, rejoinOptions);
            })
            .then(function() {
                state.inFlight = false;
                clearTimer('watchdogTimer');
                schedulePreemptiveRejoin('post-rejoin');
                log('info', 'Silent rejoin finished (' + reason + ').');
            })
            .catch(function(error) {
                state.inFlight = false;
                clearTimer('watchdogTimer');
                log('error', 'Silent rejoin failed (' + reason + ').', error);
                fallbackReload('join-failed-' + reason);
            });
    }

    function attachConference(conference) {
        if (!conference || typeof conference.on !== 'function') {
            return;
        }

        state.onInterrupted = function() {
            clearTimer('interruptTimer');
            state.interruptTimer = window.setTimeout(function() {
                attemptSilentRejoin('interrupt');
            }, SETTINGS.interruptGraceMilliseconds);
            log('warn', 'Connection interrupted, scheduling accelerated recovery.');
        };

        state.onRestored = function() {
            clearTimer('interruptTimer');
            schedulePreemptiveRejoin('connection-restored');
            log('info', 'Connection restored.');
        };

        conference.on(INTERRUPTED_EVENT, state.onInterrupted);
        conference.on(RESTORED_EVENT, state.onRestored);
    }

    function syncConferenceBinding() {
        var nextConference = getJoinedConference();

        if (nextConference === state.boundConference) {
            return;
        }

        detachConference(state.boundConference);
        state.boundConference = nextConference;
        clearTimer('interruptTimer');
        clearTimer('preemptiveTimer');

        if (!nextConference) {
            return;
        }

        state.joinedAt = Date.now();
        attachConference(nextConference);
        schedulePreemptiveRejoin('conference-joined');
    }

    function installWhenReady() {
        var store = getStore();

        if (!store || typeof store.subscribe !== 'function' || typeof store.getState !== 'function') {
            window.setTimeout(installWhenReady, 500);

            return;
        }

        store.subscribe(syncConferenceBinding);
        syncConferenceBinding();
        log('info', 'Installed local recovery workaround from custom-config.js.');
    }

    installWhenReady();
})();