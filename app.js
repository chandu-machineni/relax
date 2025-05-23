// Add stylesheet
document.head.innerHTML += '<link rel="stylesheet" href="styles.css">';
document.head.innerHTML += '<title>relax</title>';

// Audio service
const AudioService = {
  audioElement: null,
  gongSound: 'gong.mp3', // Local Tibetan meditation sound file
  lastPlayTime: 0,
  
  init() {
    console.log('Initializing audio service');
    // Clean up any previous instance
    this.destroy();
    this.createAudio();
  },
  
  createAudio() {
    console.log('Creating new audio element');
    // Create a new audio element each time
    this.audioElement = new Audio();
    this.audioElement.src = this.gongSound;
    this.audioElement.preload = 'auto';
    this.audioElement.load();
  },
  
  async arm() {
    console.log('Arming audio...');
    try {
      if (!this.audioElement) {
        this.createAudio();
      }
      
      // Just preload the audio without playing
      this.audioElement.volume = 0;
      await this.audioElement.play().catch(() => console.log('Arm sound failed, but continuing'));
      this.audioElement.pause();
      this.audioElement.currentTime = 0;
      this.audioElement.volume = 1.0; // Maximum volume
      
      console.log('Audio element armed.');
    } catch (e) {
      console.log('Error arming audio:', e);
    }
    return Promise.resolve(); // Always resolve to continue the flow
  },
  
  async play() {
    console.log('Attempting to play sound');
    try {
      // Only play if at least 500ms has passed since last play
      const now = Date.now();
      if (now - this.lastPlayTime > 500) {
        this.lastPlayTime = now;
        
        // Ensure we have an audio element
        if (!this.audioElement) {
          this.createAudio();
        }
        
        // Reset the audio to the beginning and play at higher volume
        this.audioElement.currentTime = 0;
        this.audioElement.volume = 1.0; // Maximum volume
        return this.audioElement.play().catch(e => {
          console.log('Play sound failed, retrying...', e);
          // Try recreating the audio element and playing again
          this.createAudio();
          this.audioElement.volume = 1.0; // Maximum volume
          return this.audioElement.play().catch(() => console.log('Play sound retry failed'));
        });
      }
    } catch(e) {
      console.log('Play sound failed, but continuing', e);
      // Try to recover by reinitializing
      this.init();
    }
    return Promise.resolve(); // Always resolve to continue the flow
  },
  
  destroy() {
    console.log('Destroying audio service');
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement = null;
    }
  }
};

// Keep Awake service
const KeepAwakeService = {
  wakeLock: null,
  noSleepVideo: null,
  noSleepTimer: null,
  enabled: false,
  
  // Check if we're on an iOS device that needs special handling
  isIOS() {
    return typeof navigator !== 'undefined' && 
      parseFloat(('' + (/CPU.*OS ([0-9_]{3,4})[0-9_]{0,1}|(CPU like).*AppleWebKit.*Mobile/i.exec(navigator.userAgent) || [0, ''])[1])
        .replace('undefined', '3_2').replace('_', '.').replace('_', '')) < 10 && 
      !window.MSStream;
  },
  
  // Check if wake lock API is supported
  isWakeLockSupported() {
    return 'wakeLock' in navigator;
  },
  
  // Add video source for iOS fallback
  _addSourceToVideo(video, type, dataUri) {
    const source = document.createElement('source');
    source.src = dataUri;
    source.type = `video/${type}`;
    video.appendChild(source);
  },
  
  async enable() {
    console.log('Enabling screen wake lock');
    
    if (this.enabled) return;
    
    try {
      if (this.isWakeLockSupported()) {
        // Modern wake lock API approach
        this.wakeLock = await navigator.wakeLock.request('screen');
        this.enabled = true;
        console.log('Wake Lock active.');
        
        this.wakeLock.addEventListener('release', () => {
          console.log('Wake Lock released.');
          this.enabled = false;
        });
      } else if (this.isIOS()) {
        // iOS fallback using timer
        this.destroy(); // Clean up any existing timer
        
        console.warn(`
          Using timer-based wake lock for older iOS devices.
          This can interrupt active or long-running network requests.
        `);
        
        this.noSleepTimer = window.setInterval(() => {
          if (document.hidden) return;
          
          window.location.href = window.location.href.split('#')[0];
          window.setTimeout(window.stop, 0);
        }, 15000);
        
        this.enabled = true;
      } else {
        // Video-based fallback for other browsers
        if (!this.noSleepVideo) {
          this.noSleepVideo = document.createElement('video');
          this.noSleepVideo.setAttribute('title', 'No Sleep');
          this.noSleepVideo.setAttribute('playsinline', '');
          
          // Add fake video sources to keep screen on
          // Using empty MP4 and WebM data URIs (shortened for brevity)
          const webmBase64 = 'GkXfowEAAAAAAAAfQoaBAUL3gQFC8oEEQvOBCEKChHdlYm1Ch4EEQoWBAhhTgGcBAA...';
          const mp4Base64 = 'AAAAHGZ0eXBNNFYgAAACAGlzb21pc28yYXZjMQAAAAhmcmVlAAAGF21kYXTeBAAAbGliZmFhY...';
          
          this._addSourceToVideo(this.noSleepVideo, 'webm', `data:video/webm;base64,${webmBase64}`);
          this._addSourceToVideo(this.noSleepVideo, 'mp4', `data:video/mp4;base64,${mp4Base64}`);
          
          this.noSleepVideo.addEventListener('loadedmetadata', () => {
            if (this.noSleepVideo.duration <= 1) {
              // If video is very short, loop it
              this.noSleepVideo.setAttribute('loop', '');
            } else {
              // Otherwise, reset the time periodically to keep playing
              this.noSleepVideo.addEventListener('timeupdate', () => {
                if (this.noSleepVideo.currentTime > 0.5) {
                  this.noSleepVideo.currentTime = Math.random();
                }
              });
            }
          });
        }
        
        try {
          await this.noSleepVideo.play();
          this.enabled = true;
        } catch (err) {
          console.error('Video wake lock error:', err);
          this.enabled = false;
        }
      }
    } catch (err) {
      console.error(`Wake Lock error: ${err.name}, ${err.message}`);
      this.enabled = false;
    }
  },
  
  destroy() {
    console.log('Releasing wake lock');
    
    if (this.isWakeLockSupported() && this.wakeLock) {
      this.wakeLock.release();
      this.wakeLock = null;
    } else if (this.isIOS() && this.noSleepTimer) {
      console.warn('Disabling iOS wake lock.');
      window.clearInterval(this.noSleepTimer);
      this.noSleepTimer = null;
    } else if (this.noSleepVideo) {
      this.noSleepVideo.pause();
    }
    
    this.enabled = false;
  }
};

// Store for managing state
const Store = {
  durations: Array(999).fill(null).map((_, i) => i + 1),
  durationSeconds: 60,
  startedAtSeconds: 0,
  timeElapsedSeconds: 0,
  timeLeftSeconds: 60,
  timeLeftOffsetSeconds: 0,
  timerCompletedAt: 0,
  soundPlayedForMinute: {},
  timerActive: false,
  
  get durationMinutes() {
    return Math.floor(this.durationSeconds / 60);
  },
  
  setDurationSeconds(seconds) {
    this.durationSeconds = seconds;
    this.timeLeftSeconds = seconds;
  },
  
  setDurationMinutes(minutes) {
    this.setDurationSeconds(minutes * 60);
  },
  
  start() {
    console.log('Starting session timer');
    this.startedAtSeconds = Math.floor(Date.now() / 1000);
    this.timeElapsedSeconds = 0;
    this.timerCompletedAt = 0;
    this.soundPlayedForMinute = {}; // Reset sound tracker
    this.timerActive = true;
  },
  
  stop() {
    if (this.timerActive) {
      console.log('Stopping session');
      this.timerActive = false;
      // Reset timer state
      this.timeElapsedSeconds = 0;
      this.timeLeftSeconds = this.durationSeconds;
    }
  },
  
  tick() {
    if (!this.timerActive) return;
    
    const now = Math.floor(Date.now() / 1000);
    this.timeElapsedSeconds = now - this.startedAtSeconds + this.timeLeftOffsetSeconds;
    this.timeLeftSeconds = this.durationSeconds - this.timeElapsedSeconds;
    
    if (this.timeLeftSeconds < 0) {
      this.timeLeftSeconds = 0;
    }
    
    // Log every second like reference app
    console.log({newTimeElapsedSeconds: this.timeElapsedSeconds});
    
    // Record when timer completed
    if (this.timeLeftSeconds === 0 && this.timerCompletedAt === 0) {
      this.timerCompletedAt = now;
    }
  },
  
  reset() {
    console.log('Resetting timer state');
    this.timerActive = false;
    this.timeElapsedSeconds = 0;
    this.timeLeftSeconds = this.durationSeconds;
    this.timerCompletedAt = 0;
    this.soundPlayedForMinute = {};
  }
};

// DOM Creation Helpers
function createElement(tag, className, content = '') {
  const element = document.createElement(tag);
  if (className) {
    if (Array.isArray(className)) {
      className.forEach(cls => element.classList.add(cls));
    } else {
      element.classList.add(className);
    }
  }
  if (content) {
    element.innerHTML = content;
  }
  return element;
}

// Component: Select
function createSelect(options, selectedValue, onChange) {
  const container = createElement('div', 'select-container');
  const select = createElement('select', 'select');
  const overlay = createElement('span', 'select-overlay');
  const value = createElement('span', 'select-value');
  
  options.forEach(option => {
    const optionEl = createElement('option');
    optionEl.value = option;
    optionEl.textContent = option;
    select.appendChild(optionEl);
  });
  
  select.value = selectedValue;
  value.textContent = selectedValue;
  overlay.appendChild(value);
  
  select.addEventListener('change', (e) => {
    const val = parseInt(e.target.value, 10);
    value.textContent = val;
    onChange(val);
  });
  
  container.appendChild(select);
  container.appendChild(overlay);
  
  return container;
}

// Component: Button
function createButton(label, onClick, level = 'primary') {
  const button = createElement('button', ['button', `button-${level}`], label);
  button.addEventListener('click', onClick);
  return button;
}

// Component: Text
function createText(content, options = {}) {
  const classes = ['text'];
  if (options.size) classes.push(`text-${options.size}`);
  if (options.dimmed) classes.push('text-dimmed');
  if (options.inline) classes.push('text-inline');
  if (options.align) classes.push(`text-${options.align}`);
  if (options.customClass) classes.push(options.customClass);
  
  const p = createElement('p', classes, content);
  return p;
}

// Component: Footer
function createFooter() {
  const footer = createElement('footer', 'footer');
  const text = createText('Made by <a href="https://www.linkedin.com/in/chandu-machineni" target="_blank">chandu machineni</a>', { size: 'xs', align: 'center' });
  footer.appendChild(text);
  return footer;
}

// Component: Spacer
function createSpacer() {
  return createElement('div', 'spacer');
}

// Views
const Views = {
  setup(onNext) {
    const view = createElement('div', ['view']);
    
    const homepageContent = createElement('div', 'homepage-content');
    
    // Add header with italicized "relax" text
    const header = createElement('div', 'header');
    const headerText = createText('<em>relax</em>', { size: 'l', align: 'center', customClass: 'app-title' });
    header.appendChild(headerText);
    homepageContent.appendChild(header);
    
    const container = createElement('div', 'main-container');
    
    const mainInstructionWrapper = createElement('div', 'main-instruction-wrapper');
    const textContainer = createText('I want to relax here for <span id="duration-container"></span> <span id="duration-text">minute</span>.', { align: 'center', customClass: 'main-instruction' });
    mainInstructionWrapper.appendChild(textContainer);
    container.appendChild(mainInstructionWrapper);
    
    // Now that textContainer is added to view, we can find the element
    const durationContainer = document.createElement('span');
    const durationSelect = createSelect(
      Store.durations.slice(0, 60), 
      Store.durationMinutes, 
      (value) => {
        Store.setDurationMinutes(value);
        document.getElementById('duration-text').textContent = value > 1 ? 'minutes' : 'minute';
      }
    );
    durationContainer.appendChild(durationSelect);
    
    // Wait for the next tick to ensure the element is in the DOM
    setTimeout(() => {
      const container = document.getElementById('duration-container');
      if (container) {
        container.replaceWith(durationContainer);
      }
    }, 0);
    
    const subText = createText('<em>(relax, and do nothing)</em>', { dimmed: true, size: 's', inline: true, customClass: 'sub-text' });
    container.appendChild(subText);
    
    homepageContent.appendChild(container);
    
    const startButtonContainer = createElement('div', 'start-button-container');
    const startButton = createButton('Start', () => {
      // Pre-arm audio before transitioning
      AudioService.arm().then(() => {
        // Direct transition without animation
        renderView('instructions');
      });
    });
    
    startButtonContainer.appendChild(startButton);
    homepageContent.appendChild(startButtonContainer);
    
    view.appendChild(homepageContent);
    view.appendChild(createFooter());
    
    return view;
  },

  instructions(onNext) {
    const view = createElement('div', ['view', 'instructions-view']);
    
    // Add header with italicized "relax" text
    const header = createElement('div', 'header');
    const headerText = createText('<em>relax</em>', { size: 'l', align: 'center', customClass: 'app-title' });
    header.appendChild(headerText);
    view.appendChild(header);
    
    const instructionsContainer = createElement('div', 'instructions-container');
    
    const instructionsText = createText("<strong>Important: please don't lock your screen.</strong><br/>(We need this for the page to work.)<br/><br/>Don't rush to get up.<br/><br/>I'll play a sound to let you know that the timer has expired and every minute after that, so you don't lose track of time.<br/><br/>Enjoy.", { size: 's', align: 'left' });
    
    instructionsContainer.appendChild(instructionsText);
    
    const okButton = createButton('OK', async () => {
      KeepAwakeService.enable();
      
      try {
        // Play sound when timer starts
        await AudioService.init();
        await AudioService.arm();
        await AudioService.play();
        
        // Request fullscreen if supported
        try {
          if (document.documentElement.requestFullscreen) {
            await document.documentElement.requestFullscreen().catch(e => {
              console.log('Fullscreen failed, but continuing');
            });
          }
        } catch (err) {
          console.error('Error during fullscreen transition:', err);
        }
        
        // Direct transition to active view without animation
        renderView('active');
      } catch (err) {
        console.error('Error during transition:', err);
        renderView('active');
      }
    });
    
    instructionsContainer.appendChild(okButton);
    
    view.appendChild(instructionsContainer);
    
    return view;
  },
  
  active(onNext) {
    const view = createElement('div', ['view']);
    
    // Add header with italicized "relax" text
    const header = createElement('div', 'header');
    const headerText = createText('<em>relax</em>', { size: 'l', align: 'center', customClass: 'app-title' });
    header.appendChild(headerText);
    view.appendChild(header);
    
    const timeDisplay = createText('', { dimmed: true, size: 'xs', inline: true });
    view.appendChild(timeDisplay);
    
    const centerMessageContainer = createElement('div', 'center-message');
    const infoText = createText(
      '(You can stop looking at the screen for now.)',
      { size: 's', dimmed: true }
    );
    centerMessageContainer.appendChild(infoText);
    view.appendChild(centerMessageContainer);
    
    const bottomControls = createElement('div', 'bottom-controls');
    const finishEarlyButton = createButton('Finish early', () => {
      // Stop the timer
      Store.stop();
      
      // Clean up audio service
      AudioService.destroy();
      
      // Direct transition without animation
      renderView('complete');
    }, 'secondary');
    
    bottomControls.appendChild(finishEarlyButton);
    view.appendChild(bottomControls);
    
    // Start timer
    Store.start();
    let timerCompleted = false;
    
    // Store the timer interval ID for cleanup
    let timerInterval;
    const cleanupActiveSession = () => {
      console.log('Cleaning up active session');
      // Clear the interval to stop timer updates
      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }
      // Make sure timer is stopped
      Store.stop();
    };
    
    // Set up the timer
    timerInterval = setInterval(() => {
      // Only update if timer is still active
      if (!Store.timerActive) {
        return;
      }
      
      Store.tick();
      
      // Update display
      const elapsedMinutes = Math.floor(Store.timeElapsedSeconds / 60);
      let displayText = '';
      
      if (elapsedMinutes < 1) {
        displayText = "You've been here for < 1 minute.";
      } else if (elapsedMinutes === 1) {
        displayText = "You've been here for a minute.";
      } else {
        displayText = `You've been here for ${elapsedMinutes} minutes.`;
      }
      
      timeDisplay.textContent = displayText;
      
      const now = Math.floor(Date.now() / 1000);
      
      // Check if session completed
      if (Store.timeLeftSeconds === 0) {
        // Play sound when timer ends (only once)
        if (!timerCompleted) {
          timerCompleted = true;
          AudioService.play();
          
          // Replace "finish early" with "finish" button if not already done
          bottomControls.innerHTML = '';
          const finishButton = createButton('Finish', () => {
            cleanupActiveSession();
            
            // Direct transition without animation
            renderView('complete');
          }, 'secondary');
          
          bottomControls.appendChild(finishButton);
        }
        
        // If timer is already complete, check for minute intervals for sound
        if (Store.timerCompletedAt > 0) {
          const secondsSinceCompletion = now - Store.timerCompletedAt;
          const minutesSinceCompletion = Math.floor(secondsSinceCompletion / 60);
          
          // Play sound at exact minute marks after completion
          // But only once per minute
          if (minutesSinceCompletion > 0 && !Store.soundPlayedForMinute[minutesSinceCompletion]) {
            if (secondsSinceCompletion % 60 <= 1) { // Check for the first 2 seconds of each minute
              Store.soundPlayedForMinute[minutesSinceCompletion] = true;
              AudioService.play();
              console.log(`Played sound for minute ${minutesSinceCompletion} after completion`);
            }
          }
        }
      }
    }, 1000);
    
    // Add proper cleanup
    view.addEventListener('animationend', (e) => {
      if (e.animationName === 'view-exit') {
        // Run cleanup when the view is exiting
        cleanupActiveSession();
      }
    });
    
    // Store cleanup function on the view itself for access from elsewhere
    view.cleanup = cleanupActiveSession;
    
    return view;
  },
  
  complete(onNext) {
    const view = createElement('div', ['view']);
    
    // Add header with italicized "relax" text
    const header = createElement('div', 'header');
    const headerText = createText('<em>relax</em>', { size: 'l', align: 'center', customClass: 'app-title' });
    header.appendChild(headerText);
    view.appendChild(header);
    
    // Make sure the timer is stopped and audio is fully destroyed
    Store.stop();
    AudioService.destroy();
    
    const thankYouSection = createElement('div', 'thank-you');
    
    const thankYouText = createText('Thanks! Come again any time.', { inline: true });
    thankYouSection.appendChild(thankYouText);
    
    const linkList = createElement('div', 'link-list');
    const aboutLink = createText('<a href="/about">About</a>', { 
      inline: true, size: 's' 
    });
    const sayHiLink = createText('<a target="_blank" href="https://www.linkedin.com/in/chandu-machineni">Say Hi</a>', { 
      inline: true, size: 's'
    });
    
    linkList.appendChild(aboutLink);
    linkList.appendChild(sayHiLink);
    thankYouSection.appendChild(linkList);
    
    view.appendChild(thankYouSection);
    
    const bottomControls = createElement('div', 'bottom-controls');
    const restartButton = createButton('Back to start', () => {
      // Reinitialize AudioService when going back to start
      AudioService.init();
      
      // Direct transition without animation
      renderView('setup');
    });
    
    bottomControls.appendChild(restartButton);
    view.appendChild(bottomControls);
    
    return view;
  }
};

// App initialization
document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('root');
  let currentView = null;
  let currentState = 'setup';
  
  // Global function for rendering views with animations
  window.renderView = (state) => {
    // Prevent double renders of the same state
    if (state === currentState && currentView) return;
    
    // If there's a current view, animate it out first
    if (currentView) {
      // Manually run cleanup if we're transitioning from active view
      if (currentState === 'active' && currentView.cleanup) {
        console.log('Executing active view cleanup during transition');
        currentView.cleanup();
      }
      
      // Always clean up audio when leaving active view
      if (currentState === 'active' && state !== 'active') {
        console.log('Transitioning from active view - cleaning up audio');
        AudioService.destroy();
      }
      
      // Add exiting animation
      currentView.classList.add('view-exiting');
      currentView.addEventListener('animationend', function handleExit() {
        // Once exit animation is complete, remove the view and add new one
        currentView.removeEventListener('animationend', handleExit);
        
        // Remove view from DOM
        root.removeChild(currentView);
        currentView = null;
        
        // Now proceed with adding the new view
        renderNewView();
      }, { once: true });
    } else {
      // No current view, just render the new one
      renderNewView();
    }
    
    function renderNewView() {
      // Update state
      currentState = state;
      
      // Prepare the new view based on state
      switch (state) {
        case 'setup':
          // Initialize audio but make sure we start from a clean state
          AudioService.destroy();
          AudioService.init();
          
          // Make sure timer is stopped
          Store.stop();
          
          // Ensure wake lock is released
          KeepAwakeService.destroy();
          
          currentView = Views.setup();
          break;
        case 'instructions':
          // Initialize audio but don't destroy previous instance
          AudioService.init();
          currentView = Views.instructions();
          break;
        case 'active':
          currentView = Views.active();
          break;
        case 'complete':
          // Ensure audio is fully destroyed
          AudioService.destroy();
          
          // Release wake lock
          KeepAwakeService.destroy();
          
          // Ensure timer is stopped
          Store.stop();
          
          currentView = Views.complete();
          break;
      }
      
      // Add new view with animation
      if (currentView) {
        currentView.classList.add('view-entering');
        root.appendChild(currentView);
        
        // Remove the entering class after animation completes
        currentView.addEventListener('animationend', function handleEnter() {
          currentView.removeEventListener('animationend', handleEnter);
          currentView.classList.remove('view-entering');
        }, { once: true });
      }
    }
  };
  
  // Initialize the app
  AudioService.init();
  Store.stop(); // Ensure timer is stopped initially
  renderView('setup');
}); 