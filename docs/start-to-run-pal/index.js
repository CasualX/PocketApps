import {
	VERSION,
	SPORTIVA_0_TO_5K_PRESET,
	THEME_OPTIONS,
	createApp,
	createEditablePreset,
	createEmptyInterval,
	createEmptyTraining,
	formatClock,
	formatDuration,
	getTrainingTimelineFrame,
	normalizeInterval,
	normalizeTraining,
	totalTrainingSeconds,
	validateTrainingDraft,
} from './app.js';

const STORAGE_KEY = 'start-to-run-pal-data';
const THEME_COLORS = Object.freeze({ light: '#f4ecdf', dark: '#18201d' });
const observedIntervalStrips = new WeakSet();
const USER_TRAININGS_PRESET_KEY = 'my-trainings';
const SPORTIVA_PRESET_KEY = 'sportiva-0-to-5k';
const RUNNER_VOLUME_OPTIONS = Object.freeze([
	{ key: 'off', label: 'Off', cueGain: 0, speechVolume: 0 },
	{ key: 'low', label: 'Low', cueGain: 0.09, speechVolume: 0.34 },
	{ key: 'high', label: 'High', cueGain: 0.42, speechVolume: 0.92 },
]);

function runtimePresetsForModel(model) {
	return [
		{ key: USER_TRAININGS_PRESET_KEY, ...createEditablePreset(model.trainings) },
		{ key: SPORTIVA_PRESET_KEY, ...SPORTIVA_0_TO_5K_PRESET },
	];
}

function cloneIntervalDraft(interval, intervalIndex = 0) {
	let normalizedInterval = normalizeInterval(interval, intervalIndex) || createEmptyInterval(intervalIndex);
	if (!interval || typeof interval !== 'object' || Array.isArray(interval)) {
		return normalizedInterval;
	}

	return {
		...normalizedInterval,
		name: typeof interval.name === 'string' ? interval.name : normalizedInterval.name,
	};
}

function cloneTrainingDraft(training, trainingIndex = 0) {
	let normalizedTraining = normalizeTraining(training, trainingIndex) || createEmptyTraining(trainingIndex);
	if (!training || typeof training !== 'object' || Array.isArray(training)) {
		return normalizedTraining;
	}

	let draftIntervals = Array.isArray(training.intervals)
		? training.intervals.map((interval, intervalIndex) => cloneIntervalDraft(interval, intervalIndex))
		: normalizedTraining.intervals;

	return {
		...normalizedTraining,
		name: typeof training.name === 'string' ? training.name : normalizedTraining.name,
		intervals: draftIntervals,
	};
}

function serializeTrainingDraft(training, trainingIndex = 0) {
	return JSON.stringify(cloneTrainingDraft(training, trainingIndex));
}

function intervalStartMs(training, intervalIndex = 0) {
	let intervals = Array.isArray(training?.intervals) ? training.intervals : [];
	let clampedIndex = Math.max(0, Math.min(intervals.length, intervalIndex));

	return intervals.slice(0, clampedIndex).reduce((total, interval) => total + ((Math.max(1, Number(interval?.time) || 0)) * 1000), 0);
}

function getRunnerVolumeOption(volumeKey) {
	return RUNNER_VOLUME_OPTIONS.find(option => option.key === volumeKey) || RUNNER_VOLUME_OPTIONS[RUNNER_VOLUME_OPTIONS.length - 1];
}

function parseHexColor(value) {
	let normalized = typeof value === 'string' ? value.trim() : '';
	if (!/^#[0-9a-f]{6}$/i.test(normalized)) {
		return null;
	}

	return {
		r: Number.parseInt(normalized.slice(1, 3), 16),
		g: Number.parseInt(normalized.slice(3, 5), 16),
		b: Number.parseInt(normalized.slice(5, 7), 16),
	};
}

function relativeLuminance(rgb) {
	let channels = [rgb.r, rgb.g, rgb.b].map(channel => {
		let normalized = channel / 255;
		return normalized <= 0.03928
			? normalized / 12.92
			: ((normalized + 0.055) / 1.055) ** 2.4;
	});

	return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
}

function buildRunnerThemeStyle(intervalColor) {
	let runnerColor = parseHexColor(intervalColor) ? intervalColor : '#4c7a67';
	let isLight = relativeLuminance(parseHexColor(runnerColor)) > 0.56;
	let runnerText = isLight ? '#15211d' : '#f7fbf9';
	let runnerContrast = isLight ? '#f7fbf9' : '#15211d';
	let runnerTextSoft = isLight ? 'rgba(21, 33, 29, 0.72)' : 'rgba(247, 251, 249, 0.78)';
	let runnerBorder = isLight ? 'rgba(21, 33, 29, 0.16)' : 'rgba(255, 255, 255, 0.16)';

	return `--runner-color:${runnerColor}; --runner-text:${runnerText}; --runner-contrast:${runnerContrast}; --runner-text-soft:${runnerTextSoft}; --runner-border:${runnerBorder}`;
}

function vibrateIfSupported(pattern) {
	if (!('vibrate' in navigator) || typeof navigator.vibrate !== 'function') {
		return false;
	}

	return navigator.vibrate(pattern);
}

function runnerAudioNoticeForState(state) {
	if (state === 'interrupted') {
		return 'This device paused sound after the runner lost focus. Tap Enable sound, then press Play.';
	}

	if (state === 'suspended') {
		return 'Sound needs a tap on this device. Tap Enable sound, then press Play.';
	}

	if (state === 'closed') {
		return 'Sound stopped on this device. Tap Enable sound, then press Play.';
	}

	return 'Sound is unavailable right now. Tap Enable sound, then press Play.';
}

function runnerAudioNoticeForError(error) {
	let name = typeof error?.name === 'string' ? error.name : '';
	if (name === 'NotAllowedError') {
		return 'Sound needs a tap on this device. Tap Enable sound, then press Play.';
	}

	if (name === 'NotSupportedError') {
		return 'This browser cannot play runner cues.';
	}

	return 'Sound could not start on this device. Tap Enable sound, then press Play.';
}

function runnerWakeLockNoticeForError(error) {
	let name = typeof error?.name === 'string' ? error.name : '';
	if (name === 'NotAllowedError') {
		return 'Keep the screen awake manually on this device.';
	}

	return 'This device could not keep the screen awake.';
}

function syncIntervalStripMask(element) {
	if (!(element instanceof HTMLElement)) {
		return;
	}

	let maxScrollLeft = Math.max(0, element.scrollWidth - element.clientWidth);
	let showStartMask = element.scrollLeft > 1;
	let showEndMask = maxScrollLeft > 1 && element.scrollLeft < (maxScrollLeft - 1);
	element.classList.toggle('show-start-mask', showStartMask);
	element.classList.toggle('show-end-mask', showEndMask);
}

function bindIntervalStripMask(element) {
	if (!(element instanceof HTMLElement)) {
		return;
	}

	if (observedIntervalStrips.has(element)) {
		syncIntervalStripMask(element);
		return;
	}

	observedIntervalStrips.add(element);

	let scheduleSync = () => {
		requestAnimationFrame(() => syncIntervalStripMask(element));
	};

	element.addEventListener('scroll', scheduleSync, { passive: true });
	window.addEventListener('resize', scheduleSync);

	if (typeof ResizeObserver === 'function') {
		let resizeObserver = new ResizeObserver(scheduleSync);
		let track = element.querySelector('.interval-track');
		resizeObserver.observe(element);
		if (track instanceof HTMLElement) {
			resizeObserver.observe(track);
		}
	}

	scheduleSync();
}

function createStorage() {
	return {
		load() {
			let raw = localStorage.getItem(STORAGE_KEY);
			if (!raw) {
				return createApp();
			}

			try {
				return createApp(JSON.parse(raw));
			}
			catch {
				return createApp();
			}
		},

		save(model) {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(model.toJSON()));
		},

		clear() {
			localStorage.removeItem(STORAGE_KEY);
		},
	};
}

function getSystemTheme() {
	return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveTheme(themeMode) {
	return themeMode === 'auto' ? getSystemTheme() : themeMode;
}

function applyTheme(themeMode) {
	let resolvedTheme = resolveTheme(themeMode);
	document.documentElement.dataset.theme = resolvedTheme;
	let metaTheme = document.querySelector('meta[name="theme-color"]');
	if (metaTheme) {
		metaTheme.setAttribute('content', THEME_COLORS[resolvedTheme]);
	}
}

function setOverlayScrollLock(locked) {
	document.documentElement.classList.toggle('overlay-scroll-locked', locked);
	document.body.classList.toggle('overlay-scroll-locked', locked);
}

function watchSystemThemeChange(callback) {
	let mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
	let handler = () => callback();

	if (typeof mediaQuery.addEventListener === 'function') {
		mediaQuery.addEventListener('change', handler);
	}
	else if (typeof mediaQuery.addListener === 'function') {
		mediaQuery.addListener(handler);
	}

	return () => {
		if (typeof mediaQuery.removeEventListener === 'function') {
			mediaQuery.removeEventListener('change', handler);
		}
		else if (typeof mediaQuery.removeListener === 'function') {
			mediaQuery.removeListener(handler);
		}
	};
}

function downloadJson(filename, value) {
	let blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
	let url = URL.createObjectURL(blob);
	let link = document.createElement('a');
	link.href = url;
	link.download = filename;
	link.click();
	URL.revokeObjectURL(url);
}

function createViewModel() {
	let storage = createStorage();
	let removeSystemThemeWatcher = null;
	let runnerTickTimeout = 0;
	let runnerAudioContext = null;
	let runnerAudioReadyPromise = null;
	let runnerMasterGain = null;
	let runnerVisibilityHandler = null;
	let runnerLastCountdownSecond = null;
	let runnerLastSpokenKey = '';
	let runnerWakeLock = null;
	let runnerWakeLockRequestPromise = null;

	return {
		model: storage.load(),
		selectedPresetKey: null,
		themeOptions: THEME_OPTIONS,
		runnerVolumeOptions: RUNNER_VOLUME_OPTIONS,
		settingsOpen: false,
		timeInputDraft: null,
		runner: {
			open: false,
			training: null,
			frame: null,
			elapsedBeforePauseMs: 0,
			playbackStartedAtMs: 0,
			isPlaying: false,
			completed: false,
			volumeKey: 'high',
		},
		trainingEditor: {
			open: false,
			trainingIndex: null,
			draft: null,
			initialSerialized: '',
			isNew: false,
		},
		trainingEditorErrorMessage: '',
		trainingEditorErrorTimeout: 0,
		runnerAudioNotice: '',
		runnerWakeLockNotice: '',

		init() {
			applyTheme(this.model.themeMode);
			removeSystemThemeWatcher = watchSystemThemeChange(() => {
				if (this.model.themeMode === 'auto') {
					applyTheme(this.model.themeMode);
				}
			});
			runnerVisibilityHandler = () => {
				if (!this.isRunnerOpen()) {
					return;
				}

				if (document.visibilityState !== 'visible') {
					this.releaseRunnerWakeLock();
					return;
				}

				this.syncRunnerFrame(performance.now(), { silent: true });
				void this.ensureRunnerAudioReady();
				void this.requestRunnerWakeLock();
			};
			document.addEventListener('visibilitychange', runnerVisibilityHandler);
		},

		persist() {
			storage.save(this.model);
		},

		updateOverlayScrollLock() {
			setOverlayScrollLock(this.settingsOpen || this.isTrainingEditorOpen() || this.isRunnerOpen());
		},

		isRunnerOpen() {
			return this.runner.open && this.runner.training !== null && this.runner.frame !== null;
		},

		activeRunnerTraining() {
			return this.isRunnerOpen() ? this.runner.training : null;
		},

		activeRunnerFrame() {
			return this.isRunnerOpen() ? this.runner.frame : null;
		},

		activeRunnerInterval() {
			return this.activeRunnerFrame()?.interval || null;
		},

		runnerHeaderTitle() {
			return this.activeRunnerTraining()?.name || 'Interval Runner';
		},

		runnerHeaderDetail() {
			let frame = this.activeRunnerFrame();
			if (!frame) {
				return '';
			}

			return frame.completed ? 'Complete' : `Interval ${frame.intervalIndex + 1} of ${frame.intervalCount}`;
		},

		runnerStatusLabel() {
			if (!this.isRunnerOpen()) {
				return '';
			}

			if (this.runner.completed) {
				return 'Training complete';
			}

			return this.runner.isPlaying ? 'In progress' : 'Paused';
		},

		runnerRemainingDisplay() {
			return formatClock(this.activeRunnerFrame()?.remainingSeconds || 0);
		},

		runnerTotalRemainingDisplay() {
			return formatClock(this.activeRunnerFrame()?.totalRemainingSeconds || 0);
		},

		runnerIntervalDurationDisplay() {
			let frame = this.activeRunnerFrame();
			return formatDuration(Math.ceil((frame?.intervalDurationMs || 0) / 1000));
		},

		runnerNextLabel() {
			let training = this.activeRunnerTraining();
			let frame = this.activeRunnerFrame();

			if (!training || !frame) {
				return '';
			}

			if (frame.completed) {
				return 'Final interval.';
			}

			let nextInterval = training.intervals[frame.intervalIndex + 1];
			if (!nextInterval) {
				return 'Final interval.';
			}

			return `Next: ${nextInterval.name} · ${formatDuration(nextInterval.time)}`;
		},

		runnerPlayButtonLabel() {
			if (this.runner.completed) {
				return 'Replay';
			}

			return this.runner.isPlaying ? 'Pause' : 'Play';
		},

		runnerVolumeSegmentStyle() {
			return `--segment-count:${this.runnerVolumeOptions.length}; --segment-active:${Math.max(0, this.runnerVolumeOptions.findIndex(option => option.key === this.runner.volumeKey))}`;
		},

		runnerThemeStyle() {
			return buildRunnerThemeStyle(this.activeRunnerInterval()?.color);
		},

		clearRunnerAudioNotice() {
			this.runnerAudioNotice = '';
		},

		setRunnerAudioNotice(message) {
			this.runnerAudioNotice = this.runner.volumeKey === 'off' ? '' : String(message || '');
		},

		clearRunnerWakeLockNotice() {
			this.runnerWakeLockNotice = '';
		},

		configureRunnerAudioSession() {
			if (!navigator.audioSession || typeof navigator.audioSession !== 'object') {
				return;
			}

			try {
				navigator.audioSession.type = this.isRunnerOpen() && this.runner.volumeKey !== 'off' ? 'playback' : 'auto';
			}
			catch {
				// Audio session hints are best-effort only.
			}
		},

		runnerAudioActionLabel() {
			return this.runnerAudioNotice ? 'Enable sound' : 'Test sound';
		},

		runnerCanRetryWakeLock() {
			return this.isRunnerOpen()
				&& document.visibilityState === 'visible'
				&& 'wakeLock' in navigator
				&& (!runnerWakeLock || runnerWakeLock.released);
		},

		async triggerRunnerAudioAction() {
			if (this.runner.volumeKey === 'off') {
				return;
			}

			let isReady = await this.ensureRunnerAudioReady();
			if (!isReady) {
				return;
			}

			this.playRunnerCue('interval');
			vibrateIfSupported(46);
		},

		async requestRunnerWakeLock() {
			if (runnerWakeLockRequestPromise) {
				return runnerWakeLockRequestPromise;
			}

			runnerWakeLockRequestPromise = (async () => {
				try {
					if (!this.isRunnerOpen() || document.visibilityState !== 'visible') {
						return false;
					}

					if (!('wakeLock' in navigator) || !navigator.wakeLock || typeof navigator.wakeLock.request !== 'function') {
						this.runnerWakeLockNotice = 'Keep the screen awake manually on this device.';
						return false;
					}

					if (runnerWakeLock && !runnerWakeLock.released) {
						this.clearRunnerWakeLockNotice();
						return true;
					}

					runnerWakeLock = await navigator.wakeLock.request('screen');
					runnerWakeLock.addEventListener('release', () => {
						runnerWakeLock = null;
						if (!this.isRunnerOpen() || document.visibilityState !== 'visible') {
							return;
						}

						this.runnerWakeLockNotice = 'Screen stay-awake ended. Tap Keep awake if needed.';
					});
					this.clearRunnerWakeLockNotice();
					return true;
				}
				catch (error) {
					this.runnerWakeLockNotice = runnerWakeLockNoticeForError(error);
					return false;
				}
				finally {
					runnerWakeLockRequestPromise = null;
				}
			})();

			return runnerWakeLockRequestPromise;
		},

		releaseRunnerWakeLock() {
			let activeWakeLock = runnerWakeLock;
			runnerWakeLock = null;
			runnerWakeLockRequestPromise = null;
			this.clearRunnerWakeLockNotice();

			if (activeWakeLock && !activeWakeLock.released) {
				activeWakeLock.release().catch(() => {});
			}
		},

		stopRunnerTicker() {
			if (!runnerTickTimeout) {
				return;
			}

			window.clearTimeout(runnerTickTimeout);
			runnerTickTimeout = 0;
		},

		resetRunnerAudioMarkers() {
			runnerLastCountdownSecond = null;
			runnerLastSpokenKey = '';
		},

		queueRunnerTick() {
			if (!this.runner.isPlaying || runnerTickTimeout) {
				return;
			}

			runnerTickTimeout = window.setTimeout(() => {
				runnerTickTimeout = 0;
				this.syncRunnerFrame(performance.now());
			}, 180);
		},

		syncRunnerFrame(now = performance.now(), options = {}) {
			let training = this.runner.training;
			if (!training) {
				return;
			}

			let elapsedMs = Math.max(0, this.runner.elapsedBeforePauseMs + (this.runner.isPlaying ? (now - this.runner.playbackStartedAtMs) : 0));
			let previousFrame = this.runner.frame;
			let nextFrame = getTrainingTimelineFrame(training, elapsedMs);

			if (!nextFrame) {
				return;
			}

			this.runner.frame = nextFrame;

			if (nextFrame.completed) {
				let shouldPlayCompleteCue = !previousFrame?.completed && !options.silent;
				runnerLastCountdownSecond = null;
				this.runner.elapsedBeforePauseMs = nextFrame.elapsedMs;
				this.runner.playbackStartedAtMs = 0;
				this.runner.isPlaying = false;
				this.runner.completed = true;
				this.stopRunnerTicker();

				if (shouldPlayCompleteCue) {
					this.playRunnerCue('complete');
					vibrateIfSupported([120, 50, 120, 50, 320]);
				}

				return;
			}

			let intervalChanged = Boolean(previousFrame) && previousFrame.intervalIndex !== nextFrame.intervalIndex;
			this.runner.completed = false;

			if (!this.runner.isPlaying) {
				this.runner.elapsedBeforePauseMs = nextFrame.elapsedMs;
			}

			if (this.runner.isPlaying && this.runner.volumeKey !== 'off' && runnerAudioContext && runnerAudioContext.state !== 'running' && document.visibilityState === 'visible') {
				void this.ensureRunnerAudioReady();
			}

			if (this.runner.isPlaying && !options.silent) {
				this.maybePlayRunnerCountdown(previousFrame, nextFrame);
			}

			if (intervalChanged && this.runner.isPlaying && !options.silent) {
				runnerLastCountdownSecond = null;
				this.announceRunnerInterval(nextFrame, { playCue: true });
			}

			if (this.runner.isPlaying) {
				this.queueRunnerTick();
			}
		},

		pauseRunner() {
			if (!this.runner.isPlaying) {
				return;
			}

			this.syncRunnerFrame(performance.now(), { silent: true });
			this.runner.elapsedBeforePauseMs = this.runner.frame?.elapsedMs || this.runner.elapsedBeforePauseMs;
			this.runner.playbackStartedAtMs = 0;
			this.runner.isPlaying = false;
			this.stopRunnerTicker();
		},

		maybePlayRunnerCountdown(previousFrame, nextFrame) {
			if (!previousFrame || previousFrame.intervalIndex !== nextFrame.intervalIndex || nextFrame.completed) {
				return;
			}

			let countdownSecond = nextFrame.remainingSeconds;
			if (countdownSecond < 1 || countdownSecond > 3 || runnerLastCountdownSecond === countdownSecond) {
				return;
			}

			runnerLastCountdownSecond = countdownSecond;
			this.playRunnerCue('countdown');
		},

		runnerSpeechKey(frame) {
			if (!frame || frame.completed) {
				return '';
			}

			return `${frame.intervalIndex}:${frame.interval?.name || ''}`;
		},

		announceRunnerInterval(frame, options = {}) {
			if (!frame || frame.completed) {
				return;
			}

			let speechKey = this.runnerSpeechKey(frame);
			if (!options.force && speechKey === runnerLastSpokenKey) {
				return;
			}

			runnerLastSpokenKey = speechKey;

			if (options.playCue) {
				this.playRunnerCue('interval');
				vibrateIfSupported([110, 50, 150]);
			}

			this.speakRunnerText(frame.interval.name);
		},

		resumeRunner(restart = false) {
			if (!this.runner.training) {
				return;
			}

			if (restart) {
				this.runner.elapsedBeforePauseMs = 0;
				this.runner.completed = false;
			}

			this.runner.playbackStartedAtMs = performance.now();
			this.runner.isPlaying = true;
			this.syncRunnerFrame(this.runner.playbackStartedAtMs, { silent: true });
			void this.requestRunnerWakeLock();
			void this.ensureRunnerAudioReady().then(isReady => {
				if (!isReady) {
					this.pauseRunner();
					return;
				}

				if (restart) {
					this.announceRunnerInterval(this.runner.frame, { force: true, playCue: false });
				}
			});
		},

		toggleRunnerPlayback() {
			if (!this.isRunnerOpen()) {
				return;
			}

			if (this.runner.completed) {
				this.resumeRunner(true);
				return;
			}

			if (this.runner.isPlaying) {
				this.pauseRunner();
				return;
			}

			this.resumeRunner(false);
		},

		seekRunnerInterval(intervalIndex) {
			let training = this.runner.training;
			let intervals = Array.isArray(training?.intervals) ? training.intervals : [];
			if (intervals.length === 0) {
				return;
			}

			let boundedIndex = Math.max(0, Math.min(intervals.length - 1, intervalIndex));
			let previousFrame = this.runner.frame;
			let wasPlaying = this.runner.isPlaying;
			let nextElapsedMs = intervalStartMs(training, boundedIndex);
			let nextFrame = getTrainingTimelineFrame(training, nextElapsedMs);
			if (!nextFrame) {
				return;
			}

			this.stopRunnerTicker();
			this.runner.elapsedBeforePauseMs = nextElapsedMs;
			this.runner.playbackStartedAtMs = wasPlaying ? performance.now() : 0;
			this.runner.completed = false;
			this.runner.frame = nextFrame;
			this.announceRunnerInterval(nextFrame, {
				force: !previousFrame || previousFrame.intervalIndex === nextFrame.intervalIndex,
				playCue: false,
			});

			if (wasPlaying) {
				void this.ensureRunnerAudioReady();
				this.queueRunnerTick();
			}
		},

		completeRunner(options = {}) {
			let training = this.runner.training;
			if (!training) {
				return;
			}

			this.stopRunnerTicker();
			this.runner.elapsedBeforePauseMs = totalTrainingSeconds(training) * 1000;
			this.runner.playbackStartedAtMs = 0;
			this.runner.isPlaying = false;
			this.syncRunnerFrame(performance.now(), options);
		},

		previousRunnerInterval() {
			let frame = this.activeRunnerFrame();
			if (!frame) {
				return;
			}

			let nextIndex = frame.completed
				? frame.intervalCount - 1
				: frame.intervalElapsedMs < 1000
					? Math.max(0, frame.intervalIndex - 1)
					: frame.intervalIndex;
			this.seekRunnerInterval(nextIndex);
		},

		nextRunnerInterval() {
			let frame = this.activeRunnerFrame();
			if (!frame) {
				return;
			}

			if (frame.completed || frame.intervalIndex >= (frame.intervalCount - 1)) {
				this.completeRunner();
				return;
			}

			this.seekRunnerInterval(frame.intervalIndex + 1);
		},

		async ensureRunnerAudioReady() {
			if (runnerAudioReadyPromise) {
				return runnerAudioReadyPromise;
			}

			runnerAudioReadyPromise = (async () => {
				let AudioContextClass = window.AudioContext || window.webkitAudioContext;
				let hasSpeechSynthesis = 'speechSynthesis' in window;
				this.configureRunnerAudioSession();

				try {
					if (!AudioContextClass && !hasSpeechSynthesis) {
						this.setRunnerAudioNotice('This browser cannot play runner cues.');
						return false;
					}

					if (AudioContextClass && (!runnerAudioContext || runnerAudioContext.state === 'closed')) {
						runnerAudioContext = new AudioContextClass();
						runnerMasterGain = runnerAudioContext.createGain();
						runnerMasterGain.connect(runnerAudioContext.destination);
					}

					this.updateRunnerAudioVolume();

					if (runnerAudioContext && runnerAudioContext.state !== 'running' && runnerAudioContext.state !== 'closed') {
						await runnerAudioContext.resume();
					}

					if (hasSpeechSynthesis) {
						window.speechSynthesis.getVoices();
					}

					let isReady = !runnerAudioContext || runnerAudioContext.state === 'running';
					if (!isReady) {
						this.setRunnerAudioNotice(runnerAudioNoticeForState(runnerAudioContext?.state));
						return false;
					}

					this.clearRunnerAudioNotice();
					return true;
				}
				catch (error) {
					this.setRunnerAudioNotice(runnerAudioNoticeForError(error));
					return false;
				}
				finally {
					runnerAudioReadyPromise = null;
				}
			})();

			return runnerAudioReadyPromise;
		},

		updateRunnerAudioVolume() {
			if (!runnerMasterGain) {
				return;
			}

			runnerMasterGain.gain.value = getRunnerVolumeOption(this.runner.volumeKey).cueGain;
		},

		speakRunnerText(message) {
			let volumeOption = getRunnerVolumeOption(this.runner.volumeKey);
			if (!('speechSynthesis' in window) || volumeOption.speechVolume <= 0) {
				return;
			}

			let spokenText = String(message || '').trim();
			if (!spokenText) {
				return;
			}

			window.speechSynthesis.cancel();
			let utterance = new SpeechSynthesisUtterance(spokenText);
			utterance.volume = volumeOption.speechVolume;
			utterance.rate = 0.92;
			utterance.pitch = 1;
			window.speechSynthesis.speak(utterance);
		},

		playRunnerCue(kind = 'interval') {
			if (!runnerAudioContext || !runnerMasterGain || this.runner.volumeKey === 'off') {
				return;
			}

			if (runnerAudioContext.state !== 'running') {
				this.setRunnerAudioNotice(runnerAudioNoticeForState(runnerAudioContext.state));
				return;
			}

			let pattern = kind === 'complete'
				? [
					{ frequency: 932.33, start: 0, duration: 1, peak: 0.9 },
				]
				: kind === 'countdown'
					? [
						{ frequency: 1320, start: 0, duration: 0.085, peak: 1.2 },
					]
					: [
						{ frequency: 739.99, start: 0, duration: 0.075, peak: 0.52 },
						{ frequency: 987.77, start: 0.11, duration: 0.085, peak: 0.62 },
					];
			let now = runnerAudioContext.currentTime + 0.01;

			for (let note of pattern) {
				let oscillator = runnerAudioContext.createOscillator();
				let envelope = runnerAudioContext.createGain();
				let startAt = now + note.start;
				let endAt = startAt + note.duration;

				oscillator.type = 'sine';
				oscillator.frequency.value = note.frequency;
				envelope.gain.setValueAtTime(0.0001, startAt);
				envelope.gain.linearRampToValueAtTime(note.peak, startAt + 0.012);
				envelope.gain.exponentialRampToValueAtTime(0.0001, endAt);

				oscillator.connect(envelope);
				envelope.connect(runnerMasterGain);
				oscillator.start(startAt);
				oscillator.stop(endAt + 0.02);
			}
		},

		setRunnerVolume(volumeKey) {
			if (!RUNNER_VOLUME_OPTIONS.some(option => option.key === volumeKey)) {
				return;
			}

			this.runner.volumeKey = volumeKey;
			this.configureRunnerAudioSession();
			this.updateRunnerAudioVolume();

			if (volumeKey !== 'off') {
				void this.ensureRunnerAudioReady();
			}
			else {
				this.clearRunnerAudioNotice();
			}
		},

		canStartTraining(training) {
			return Array.isArray(training?.intervals) && training.intervals.length > 0;
		},

		openSettings() {
			this.settingsOpen = true;
			this.updateOverlayScrollLock();
		},

		closeSettings() {
			this.settingsOpen = false;
			this.updateOverlayScrollLock();
		},

		isTrainingEditorOpen() {
			return this.trainingEditor.open && this.trainingEditor.draft !== null;
		},

		activeTrainingIndex() {
			if (!this.isTrainingEditorOpen()) {
				return -1;
			}

			if (typeof this.trainingEditor.trainingIndex === 'number') {
				return this.trainingEditor.trainingIndex;
			}

			return this.selectedPresetTrainings().length;
		},

		activeTraining() {
			return this.isTrainingEditorOpen() ? this.trainingEditor.draft : null;
		},

		trainingEditorTitle() {
			return this.trainingEditor.isNew ? 'Add Training' : 'Edit Training';
		},

		canSaveTrainingEditor() {
			return this.canEditSelectedPreset() && Boolean(this.activeTraining());
		},

		clearTrainingEditorError() {
			this.trainingEditorErrorMessage = '';
			if (this.trainingEditorErrorTimeout) {
				window.clearTimeout(this.trainingEditorErrorTimeout);
				this.trainingEditorErrorTimeout = 0;
			}
		},

		showTrainingEditorError(message) {
			this.clearTrainingEditorError();
			this.trainingEditorErrorMessage = message;
			this.trainingEditorErrorTimeout = window.setTimeout(() => {
				this.trainingEditorErrorMessage = '';
				this.trainingEditorErrorTimeout = 0;
			}, 2800);
		},

		hasUnsavedTrainingChanges() {
			if (!this.isTrainingEditorOpen()) {
				return false;
			}

			return serializeTrainingDraft(this.trainingEditor.draft, this.activeTrainingIndex()) !== this.trainingEditor.initialSerialized;
		},

		updateTrainingDraft(nextTraining) {
			if (!this.isTrainingEditorOpen()) {
				return;
			}

			this.clearTrainingEditorError();

			this.trainingEditor = {
				...this.trainingEditor,
				draft: cloneTrainingDraft(nextTraining, this.activeTrainingIndex()),
			};
		},

		updateDraftInterval(intervalIndex, patch) {
			let training = this.activeTraining();
			let interval = training?.intervals?.[intervalIndex];
			if (!training || !interval) {
				return;
			}

			let nextIntervals = training.intervals.slice();
			nextIntervals[intervalIndex] = cloneIntervalDraft({ ...interval, ...patch }, intervalIndex);
			this.updateTrainingDraft({
				...training,
				intervals: nextIntervals,
			});
		},

		presetEntries() {
			return runtimePresetsForModel(this.model);
		},

		activePreset() {
			return this.presetEntries().find(preset => preset.key === this.selectedPresetKey) || null;
		},

		hasSelectedPreset() {
			return this.activePreset() !== null;
		},

		selectedPresetName() {
			return this.activePreset()?.title || '';
		},

		selectedPresetTrainings() {
			return this.activePreset()?.trainings || [];
		},

		canEditSelectedPreset() {
			return this.activePreset()?.isEditable === true;
		},

		selectPreset(presetKey) {
			if (!this.presetEntries().some(preset => preset.key === presetKey)) {
				return;
			}

			this.selectedPresetKey = presetKey;
			this.closeRunner(true);
			this.closeTrainingEditor();
		},

		goToPresetList() {
			this.selectedPresetKey = null;
			this.closeRunner(true);
			this.closeTrainingEditor();
		},

		setTheme(themeMode) {
			this.model.setThemeMode(themeMode);
			this.persist();
			applyTheme(this.model.themeMode);
		},

		themeLabel(themeMode) {
			return themeMode.charAt(0).toUpperCase() + themeMode.slice(1);
		},

		themeSegmentStyle() {
			return `--segment-count:${this.themeOptions.length}; --segment-active:${Math.max(0, this.themeOptions.indexOf(this.model.themeMode))}`;
		},

		presetSummary(presetKey) {
			let trainings = this.presetEntries().find(preset => preset.key === presetKey)?.trainings || [];
			if (trainings.length === 0) {
				return 'No trainings yet';
			}

			return `${trainings.length} trainings`;
		},

		trainingDurationLabel(training) {
			return formatDuration(totalTrainingSeconds(training));
		},

		intervalDurationLabel(interval) {
			return formatDuration(interval.time);
		},

		bindIntervalStripMask(element) {
			bindIntervalStripMask(element);
		},

		intervalStyle(interval, intervalIndex = 0) {
			let seconds = Math.max(5, Number(interval?.time) || 0);
			let curvedWidth = 44 + (Math.log2((seconds / 30) + 1) * 34);
			let width = Math.max(98, Math.min(186, Math.round(curvedWidth + ((intervalIndex % 3) * 7))));
			return `--interval-color:${interval.color}; --interval-width:${width}px`;
		},

		intervalEditorStyle(interval) {
			return `--interval-color:${interval.color}`;
		},

		intervalMinutes(interval) {
			return Math.floor((Number(interval?.time) || 0) / 60);
		},

		intervalSeconds(interval) {
			return Math.max(0, (Number(interval?.time) || 0) % 60);
		},

		intervalSecondsDisplay(interval) {
			return String(this.intervalSeconds(interval)).padStart(2, '0');
		},

		timePartDraftValue(value) {
			return String(value ?? '').replace(/[^0-9]/g, '').slice(0, 2);
		},

		timePartValue(interval, intervalIndex, part) {
			if (this.timeInputDraft?.intervalIndex === intervalIndex && this.timeInputDraft?.part === part) {
				return this.timeInputDraft.value;
			}

			return part === 'minutes'
				? String(Math.min(59, this.intervalMinutes(interval)))
				: this.intervalSecondsDisplay(interval);
		},

		startTimePartEdit(interval, intervalIndex, part, event) {
			if (!this.canEditSelectedPreset()) {
				return;
			}

			this.timeInputDraft = {
				intervalIndex,
				part,
				value: this.timePartValue(interval, intervalIndex, part),
			};

			let input = event?.target;
			if (input instanceof HTMLInputElement) {
				requestAnimationFrame(() => input.select());
			}
		},

		changeTimePartDraft(intervalIndex, part, value) {
			if (this.timeInputDraft?.intervalIndex !== intervalIndex || this.timeInputDraft?.part !== part) {
				return;
			}

			this.timeInputDraft.value = this.timePartDraftValue(value);
		},

		finishTimePartEdit(interval, intervalIndex, part) {
			if (this.timeInputDraft?.intervalIndex !== intervalIndex || this.timeInputDraft?.part !== part) {
				return;
			}

			let nextValue = this.normalizeTimePart(this.timeInputDraft.value, 59);
			this.updateDraftInterval(intervalIndex, {
				time: part === 'minutes'
					? (nextValue * 60) + this.intervalSeconds(interval)
					: (this.intervalMinutes(interval) * 60) + nextValue,
			});
			this.timeInputDraft = null;
		},

		cancelTimePartEdit(intervalIndex, part) {
			if (this.timeInputDraft?.intervalIndex !== intervalIndex || this.timeInputDraft?.part !== part) {
				return;
			}

			this.timeInputDraft = null;
		},

		normalizeTimePart(value, upperBound = Number.POSITIVE_INFINITY) {
			let digitsOnly = String(value ?? '').replace(/[^0-9]/g, '');
			if (!digitsOnly) {
				return 0;
			}

			let nextValue = Number(digitsOnly);
			if (!Number.isFinite(nextValue)) {
				return 0;
			}

			return Math.max(0, Math.min(upperBound, Math.floor(nextValue)));
		},

		trainingIntervalsPreview(training) {
			return training.intervals.map(interval => interval.name).join(' · ');
		},

		openTrainingEditor(trainingIndex) {
			if (!this.canEditSelectedPreset()) {
				return;
			}

			let training = this.selectedPresetTrainings()[trainingIndex];
			if (!training) {
				return;
			}

			this.timeInputDraft = null;
			this.clearTrainingEditorError();

			this.trainingEditor = {
				open: true,
				trainingIndex,
				draft: cloneTrainingDraft(training, trainingIndex),
				initialSerialized: serializeTrainingDraft(training, trainingIndex),
				isNew: false,
			};
			this.updateOverlayScrollLock();
		},

		closeTrainingEditor(force = false) {
			if (!force && this.hasUnsavedTrainingChanges()) {
				let discardConfirmed = window.confirm('Discard your unsaved training changes?');
				if (!discardConfirmed) {
					return;
				}
			}

			this.timeInputDraft = null;
			this.clearTrainingEditorError();

			this.trainingEditor = {
				open: false,
				trainingIndex: null,
				draft: null,
				initialSerialized: '',
				isNew: false,
			};
			this.updateOverlayScrollLock();
		},

		saveTrainingEditor() {
			let draft = this.activeTraining();
			if (!this.canEditSelectedPreset() || !draft) {
				return;
			}

			let validationMessage = validateTrainingDraft(draft);
			if (validationMessage) {
				this.showTrainingEditorError(validationMessage);
				return;
			}

			if (this.trainingEditor.isNew) {
				this.model.addTraining(draft);
			}
			else if (typeof this.trainingEditor.trainingIndex === 'number') {
				this.model.updateTraining(this.trainingEditor.trainingIndex, draft);
			}

			this.persist();
			this.closeTrainingEditor(true);
		},

		startTraining(training) {
			if (!this.canStartTraining(training)) {
				return;
			}

			let snapshot = cloneTrainingDraft(training);
			let initialFrame = getTrainingTimelineFrame(snapshot, 0);
			if (!initialFrame) {
				return;
			}

			this.stopRunnerTicker();
			this.closeSettings();
			this.closeTrainingEditor(true);
			this.runner = {
				...this.runner,
				open: true,
				training: snapshot,
				frame: initialFrame,
				elapsedBeforePauseMs: 0,
				playbackStartedAtMs: performance.now(),
				isPlaying: true,
				completed: false,
			};
			this.resetRunnerAudioMarkers();
			this.clearRunnerAudioNotice();
			this.clearRunnerWakeLockNotice();
			this.updateOverlayScrollLock();
			this.syncRunnerFrame(this.runner.playbackStartedAtMs, { silent: true });
			void this.requestRunnerWakeLock();
			void this.ensureRunnerAudioReady().then(isReady => {
				if (!isReady) {
					this.pauseRunner();
					return;
				}

				this.announceRunnerInterval(this.runner.frame, { force: true, playCue: false });
			});
		},

		closeRunner(force = false) {
			if (!this.isRunnerOpen()) {
				return;
			}

			let hasProgress = (this.runner.frame?.elapsedMs || this.runner.elapsedBeforePauseMs) > 0;
			if (!force && !this.runner.completed && hasProgress) {
				let exitConfirmed = window.confirm('Exit the interval runner?');
				if (!exitConfirmed) {
					return;
				}
			}

			this.stopRunnerTicker();
			this.releaseRunnerWakeLock();
			this.runner = {
				...this.runner,
				open: false,
				training: null,
				frame: null,
				elapsedBeforePauseMs: 0,
				playbackStartedAtMs: 0,
				isPlaying: false,
				completed: false,
			};
			this.resetRunnerAudioMarkers();
			this.clearRunnerAudioNotice();
			if ('speechSynthesis' in window) {
				window.speechSynthesis.cancel();
			}
			this.configureRunnerAudioSession();
			this.updateOverlayScrollLock();
		},

		addTraining() {
			if (!this.canEditSelectedPreset()) {
				return;
			}

			let nextTrainingIndex = this.selectedPresetTrainings().length;
			this.timeInputDraft = null;
			this.clearTrainingEditorError();
			this.trainingEditor = {
				open: true,
				trainingIndex: null,
				draft: createEmptyTraining(nextTrainingIndex),
				initialSerialized: serializeTrainingDraft(createEmptyTraining(nextTrainingIndex), nextTrainingIndex),
				isNew: true,
			};
			this.updateOverlayScrollLock();
		},

		removeTraining(trainingIndex) {
			if (!this.canEditSelectedPreset()) {
				return;
			}

			if (!window.confirm('Remove this training?')) {
				return;
			}

			this.model.removeTraining(trainingIndex);
			if (this.trainingEditor.trainingIndex === trainingIndex) {
				this.closeTrainingEditor(true);
			}
			else if (typeof this.trainingEditor.trainingIndex === 'number' && this.trainingEditor.trainingIndex > trainingIndex) {
				this.trainingEditor.trainingIndex -= 1;
			}
			this.persist();
		},

		setTrainingName(trainingIndex, value) {
			if (!this.canEditSelectedPreset()) {
				return;
			}

			let training = this.activeTraining();
			if (!training) {
				return;
			}

			this.updateTrainingDraft({
				...training,
				name: value,
			});
		},

		addInterval(trainingIndex) {
			if (!this.canEditSelectedPreset()) {
				return;
			}

			let training = this.activeTraining();
			if (!training) {
				return;
			}

			this.updateTrainingDraft({
				...training,
				intervals: training.intervals.concat([createEmptyInterval(training.intervals.length)]),
			});
		},

		removeInterval(trainingIndex, intervalIndex) {
			if (!this.canEditSelectedPreset()) {
				return;
			}

			let training = this.activeTraining();
			if (!training || !training.intervals[intervalIndex]) {
				return;
			}

			let nextIntervals = training.intervals.filter((_, index) => index !== intervalIndex);
			this.updateTrainingDraft({
				...training,
				intervals: nextIntervals,
			});
		},

		setIntervalName(trainingIndex, intervalIndex, value) {
			if (!this.canEditSelectedPreset()) {
				return;
			}

			this.updateDraftInterval(intervalIndex, { name: value });
		},

		setIntervalColor(trainingIndex, intervalIndex, value) {
			if (!this.canEditSelectedPreset()) {
				return;
			}

			this.updateDraftInterval(intervalIndex, { color: value });
		},

		duplicateInterval(trainingIndex, intervalIndex) {
			if (!this.canEditSelectedPreset()) {
				return;
			}

			let training = this.activeTraining();
			let interval = training?.intervals?.[intervalIndex];
			if (!training || !interval) {
				return;
			}

			this.updateTrainingDraft({
				...training,
				intervals: training.intervals.concat([cloneIntervalDraft(interval, training.intervals.length)]),
			});
		},

		triggerImport() {
			if (this.$refs.importFile) {
				this.$refs.importFile.value = '';
				this.$refs.importFile.click();
			}
		},

		applyImportedData(imported) {
			this.model = createApp(imported);
			this.timeInputDraft = null;
			this.closeRunner(true);
			this.closeTrainingEditor(true);
			this.persist();
			applyTheme(this.model.themeMode);
		},

		async handleImport(event) {
			let file = event?.target?.files?.[0] ?? null;
			if (!file) {
				return;
			}

			try {
				let content = await file.text();
				let imported = JSON.parse(content);
				if (!imported || imported.version !== VERSION) {
					throw new Error('Unsupported version');
				}
				this.applyImportedData(imported);
				this.closeSettings();
				window.alert('App data imported.');
			}
			catch {
				window.alert(`Import failed. Backup data must have version ${VERSION}.`);
			}
			finally {
				if (event?.target) {
					event.target.value = '';
				}
			}
		},

		exportData() {
			let stamp = new Date().toISOString().slice(0, 10);
			downloadJson(`start-to-run-pal-data-${stamp}.json`, this.model.toJSON());
		},

		resetAppData() {
			this.model = createApp();
			this.selectedPresetKey = null;
			this.timeInputDraft = null;
			this.closeRunner(true);
			this.closeTrainingEditor(true);
			storage.clear();
			this.persist();
			applyTheme(this.model.themeMode);
		},

		confirmWipeData() {
			let ok = window.confirm('Wipe all saved app data? This will erase your trainings and settings on this device. Continue?');
			if (!ok) {
				return;
			}

			this.resetAppData();
			this.closeSettings();
			window.alert('Saved data wiped.');
		},

		destroy() {
			this.stopRunnerTicker();
			this.resetRunnerAudioMarkers();
			this.releaseRunnerWakeLock();
			setOverlayScrollLock(false);

			if (typeof removeSystemThemeWatcher === 'function') {
				removeSystemThemeWatcher();
				removeSystemThemeWatcher = null;
			}

			if (runnerVisibilityHandler) {
				document.removeEventListener('visibilitychange', runnerVisibilityHandler);
				runnerVisibilityHandler = null;
			}

			if (runnerAudioContext && typeof runnerAudioContext.close === 'function') {
				runnerAudioContext.close().catch(() => {});
			}

			if ('speechSynthesis' in window) {
				window.speechSynthesis.cancel();
			}

			this.configureRunnerAudioSession();
			runnerAudioContext = null;
			runnerAudioReadyPromise = null;
			runnerMasterGain = null;
		},
	};
}

window.startToRunPalViewModel = createViewModel;
