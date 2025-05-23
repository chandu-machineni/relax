// Add stylesheet
document.head.innerHTML += '<link rel="stylesheet" href="styles.css">';

// Audio service
const AudioService = {
  audioElement: null,
  audioContext: null,
  gongBuffer: null,
  // Use a real gong sound (base64 encoded)
  gongSound: 'https://soundbible.com/grab.php?id=1815&type=mp3',
  lastPlayTime: 0,
  
  init() {
    console.log('Initializing audio service');
    // Always create a new audio element
    this.destroy();
    this.createAudio();
    
    // Initialize Web Audio API if supported
    try {
      if (typeof AudioContext !== 'undefined') {
        this.audioContext = new AudioContext();
        // Preload the gong sound for Web Audio API
        this.loadGongSound();
      }
    } catch(e) {
      console.log('Web Audio API not supported, falling back to simple audio');
    }
  },
  
  loadGongSound() {
    console.log('Loading gong sound for Web Audio API');
    if (!this.audioContext) return;
    
    fetch(this.gongSound)
      .then(response => response.arrayBuffer())
      .then(arrayBuffer => this.audioContext.decodeAudioData(arrayBuffer))
      .then(audioBuffer => {
        this.gongBuffer = audioBuffer;
        console.log('Gong sound loaded successfully');
      })
      .catch(error => {
        console.log('Error loading gong sound:', error);
      });
  },
  
  createAudio() {
    console.log('Creating new audio element');
    // Create a new audio element each time
    this.audioElement = new Audio();
    this.audioElement.src = this.gongSound;
    // Preload the sound
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
    } catch(e) {
      console.log('Arm sound failed, but continuing');
    }
  },
  
  async play() {
    console.log('Attempting to play sound');
    try {
      // Only play if at least 500ms has passed since last play
      const now = Date.now();
      if (now - this.lastPlayTime > 500) {
        this.lastPlayTime = now;
        
        // Try to play using Web Audio API for better sound if available
        if (this.audioContext && this.gongBuffer) {
          this.playResonantGong();
          return Promise.resolve();
        }
        
        // Fallback to regular audio element
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
  },
  
  playResonantGong() {
    console.log('Playing resonant gong with Web Audio API');
    if (!this.audioContext || !this.gongBuffer) return;
    
    // Create a new buffer source for each play
    const source = this.audioContext.createBufferSource();
    source.buffer = this.gongBuffer;
    
    // Create gain node for volume control
    const gainNode = this.audioContext.createGain();
    gainNode.gain.value = 1.0; // Full volume
    
    // Create convolver (reverb)
    const convolver = this.audioContext.createConvolver();
    
    // Create a custom impulse response for the reverb
    const reverbSeconds = 3.0;
    const sampleRate = this.audioContext.sampleRate;
    const length = sampleRate * reverbSeconds;
    const impulse = this.audioContext.createBuffer(2, length, sampleRate);
    const leftChannel = impulse.getChannelData(0);
    const rightChannel = impulse.getChannelData(1);
    
    // Create an impulse response with an exponential decay
    for (let i = 0; i < length; i++) {
      const decay = Math.pow(0.01, i / length);
      leftChannel[i] = (Math.random() * 2 - 1) * decay;
      rightChannel[i] = (Math.random() * 2 - 1) * decay;
    }
    
    convolver.buffer = impulse;
    
    // Create a delay node for echo effect
    const delay = this.audioContext.createDelay();
    delay.delayTime.value = 0.3; // 300ms delay
    
    // Create a feedback for the delay
    const feedbackGain = this.audioContext.createGain();
    feedbackGain.gain.value = 0.4; // 40% feedback
    
    // Connect everything
    source.connect(gainNode);
    gainNode.connect(convolver);
    convolver.connect(this.audioContext.destination);
    
    // Add delay loop
    gainNode.connect(delay);
    delay.connect(feedbackGain);
    feedbackGain.connect(delay);
    delay.connect(this.audioContext.destination);
    
    // Start the sound
    source.start();
  },
  
  destroy() {
    console.log('Destroying audio service');
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement = null;
    }
    
    // Clean up Web Audio API resources
    if (this.audioContext) {
      if (this.audioContext.state !== 'closed') {
        try {
          this.audioContext.close();
        } catch(e) {
          console.log('Error closing audio context:', e);
        }
      }
      this.audioContext = null;
      this.gongBuffer = null;
    }
  }
};

// Keep Awake service
const KeepAwakeService = {
  wakeLock: null,
  
  async enable() {
    console.log('Enabling screen wake lock');
    try {
      if ('wakeLock' in navigator) {
        this.wakeLock = await navigator.wakeLock.request('screen');
        console.log('Wake Lock active');
        this.wakeLock.addEventListener('release', () => {
          console.log('Wake Lock released');
        });
      } else {
        console.warn('Wake Lock API not supported');
      }
    } catch (err) {
      console.error(`Wake Lock error: ${err.name}, ${err.message}`);
    }
  },
  
  destroy() {
    console.log('Releasing wake lock');
    if (this.wakeLock) {
      this.wakeLock.release();
      this.wakeLock = null;
    }
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
    this.startedAtSeconds = Math.floor(Date.now() / 1000);
    this.timeElapsedSeconds = 0;
    this.timerCompletedAt = 0;
    this.soundPlayedForMinute = {}; // Reset sound tracker
    this.timerActive = true;
  },
  
  stop() {
    console.log('Stopping session');
    this.timerActive = false;
  },
  
  tick() {
    if (!this.timerActive) return;
    
    const now = Math.floor(Date.now() / 1000);
    this.timeElapsedSeconds = now - this.startedAtSeconds + this.timeLeftOffsetSeconds;
    this.timeLeftSeconds = this.durationSeconds - this.timeElapsedSeconds;
    
    if (this.timeLeftSeconds < 0) {
      this.timeLeftSeconds = 0;
    }
    
    // Record when timer completed
    if (this.timeLeftSeconds === 0 && this.timerCompletedAt === 0) {
      this.timerCompletedAt = now;
    }
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
  const text = createText('Made by <a href="https://www.linkedin.com/in/chandu-machineni" target="_blank"><span>chandu machineni</span></a>', { size: 'xs', align: 'center' });
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
    const view = createElement('div', ['view', 'view-entering']);
    
    const homepageContent = createElement('div', 'homepage-content');
    
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
      AudioService.arm().then(() => {
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
    const view = createElement('div', ['view', 'instructions-view', 'view-entering']);
    
    const instructionsContainer = createElement('div', 'instructions-container');
    
    const instructionsText = createText("<strong>Important: please don't lock your screen.</strong><br/>(We need this for the page to work.)<br/><br/>Don't rush to get up.<br/><br/>I'll play a sound to let you know that the timer has expired and every minute after that, so you don't lose track of time.<br/><br/>Enjoy.", { size: 's', align: 'left' });
    
    instructionsContainer.appendChild(instructionsText);
    
    const okButton = createButton('OK', async () => {
      view.classList.remove('view-entering');
      view.classList.add('view-exiting');
      
      KeepAwakeService.enable();
      
      try {
        // Play sound when timer starts
        await AudioService.init();
        await AudioService.arm();
        await AudioService.play();
        
        // Request fullscreen after animating out current view
        setTimeout(async () => {
          try {
            if (document.documentElement.requestFullscreen) {
              await document.documentElement.requestFullscreen().catch(e => {
                console.log('Fullscreen failed, but continuing');
              });
            }
            // Immediately transition to active view
            renderView('active');
          } catch (err) {
            console.error('Error during fullscreen transition:', err);
            renderView('active');
          }
        }, 300);
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
    const view = createElement('div', ['view', 'view-entering']);
    
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
      view.classList.remove('view-entering');
      view.classList.add('view-exiting');
      Store.stop(); // Stop the timer
      setTimeout(() => renderView('complete'), 1000);
    }, 'secondary');
    
    bottomControls.appendChild(finishEarlyButton);
    view.appendChild(bottomControls);
    
    // Start timer
    Store.start();
    let timerCompleted = false;
    
    const timerInterval = setInterval(() => {
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
            clearInterval(timerInterval);
            Store.stop(); // Stop the timer
            view.classList.remove('view-entering');
            view.classList.add('view-exiting');
            setTimeout(() => renderView('complete'), 1000);
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
    
    // Cleanup on view change
    view.addEventListener('animationend', (e) => {
      if (e.animationName === 'view-exit') {
        clearInterval(timerInterval);
        Store.stop(); // Ensure timer is stopped
      }
    });
    
    return view;
  },
  
  complete(onNext) {
    const view = createElement('div', ['view', 'view-entering']);
    
    // Make sure the timer is stopped
    Store.stop();
    
    const thankYouSection = createElement('div', 'thank-you');
    
    const thankYouText = createText('Thanks! Come again any time.', { inline: true });
    thankYouSection.appendChild(thankYouText);
    
    const linkList = createElement('div', 'link-list');
    const aboutLink = createText('<a target="_blank" href="about.html">About</a>', { 
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
      view.classList.remove('view-entering');
      view.classList.add('view-exiting');
      
      // Reinitialize AudioService when going back to start
      AudioService.init();
      
      setTimeout(() => renderView('setup'), 1000);
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
  
  // Global function for rendering views
  window.renderView = (state) => {
    if (currentView) {
      root.removeChild(currentView);
    }
    
    // Clean up any timers or sounds when changing views
    if (currentState === 'active' && state !== 'active') {
      Store.stop(); // Stop any active timers
    }
    
    currentState = state;
    
    // Always reinitialize audio when changing views
    if (state === 'setup') {
      AudioService.init();
      Store.stop(); // Ensure no timers are running
    }
    
    switch (state) {
      case 'setup':
        currentView = Views.setup();
        break;
      case 'instructions':
        // Reinitialize audio before instructions view
        AudioService.init();
        currentView = Views.instructions();
        break;
      case 'active':
        currentView = Views.active();
        break;
      case 'complete':
        AudioService.destroy();
        KeepAwakeService.destroy();
        Store.stop(); // Ensure timer is stopped
        currentView = Views.complete();
        break;
    }
    
    root.appendChild(currentView);
  };
  
  // Initialize the app
  AudioService.init();
  Store.stop(); // Ensure timer is stopped initially
  renderView('setup');
}); 