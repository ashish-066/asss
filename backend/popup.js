// Popup functionality for Safety Extension
class PopupManager {
  constructor() {
    this.volunteers = [];
    this.dailyLimits = {};
    this.settings = {};
    this.init();
  }

  async init() {
    await this.loadData();
    this.setupEventListeners();
    this.setupTabs();
    this.updateUI();
  }

  async loadData() {
    try {
      console.log('📥 Popup loading data from storage...');
      const result = await chrome.storage.local.get(['volunteers', 'dailyLimits', 'authSettings']);
      console.log('📥 Raw storage data:', result);
      
      this.volunteers = result.volunteers || [];
      this.dailyLimits = result.dailyLimits || {};
      this.settings = result.authSettings || {
        otpEnabled: true,
        dailyLimitsEnabled: true,
        volunteerRequired: true,
        otpExpiryMinutes: 5
      };
      
      console.log('📥 Popup loaded data:', {
        volunteers: this.volunteers,
        dailyLimits: this.dailyLimits,
        settings: this.settings
      });
      
      // Also send volunteers to background script immediately
      if (this.volunteers.length > 0) {
        try {
          await chrome.runtime.sendMessage({ 
            type: 'updateVolunteers', 
            volunteers: this.volunteers 
          });
          console.log('📡 Sent existing volunteers to background script on load');
        } catch (error) {
          console.error('❌ Failed to send volunteers to background on load:', error);
        }
      }
    } catch (error) {
      console.error('Error loading popup data:', error);
    }
  }

  async saveData() {
    try {
      console.log('💾 Popup saving data:', {
        volunteers: this.volunteers,
        dailyLimits: this.dailyLimits,
        authSettings: this.settings
      });
      
      // Save to storage
      await chrome.storage.local.set({
        volunteers: this.volunteers,
        dailyLimits: this.dailyLimits,
        authSettings: this.settings
      });
      
      console.log('✅ Popup data saved to storage');
      
      // Also send volunteers directly to background script
      try {
        await chrome.runtime.sendMessage({ 
          type: 'updateVolunteers', 
          volunteers: this.volunteers 
        });
        console.log('📡 Sent volunteers directly to background script');
        
        // Wait a bit then verify
        setTimeout(async () => {
          try {
            const response = await chrome.runtime.sendMessage({ type: 'getVolunteerCount' });
            console.log('✅ Verification - Background script has:', response.count, 'volunteers');
          } catch (error) {
            console.error('❌ Verification failed:', error);
          }
        }, 500);
        
      } catch (error) {
        console.error('❌ Failed to send volunteers to background script:', error);
      }
    } catch (error) {
      console.error('Error saving popup data:', error);
    }
  }

  setupTabs() {
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const targetTab = tab.dataset.tab;
        
        // Remove active class from all tabs and contents
        tabs.forEach(t => t.classList.remove('active'));
        tabContents.forEach(tc => tc.classList.remove('active'));
        
        // Add active class to clicked tab and corresponding content
        tab.classList.add('active');
        document.getElementById(`${targetTab}-tab`).classList.add('active');
    });
  });
  }

  setupEventListeners() {
    // Add volunteer button
    document.getElementById('add-volunteer-btn').addEventListener('click', () => {
      this.addVolunteer();
    });

    // Save settings button
    document.getElementById('save-settings-btn').addEventListener('click', () => {
      this.saveSettings();
    });

    // Load settings into form
    this.loadSettings();
  }

  async addVolunteer() {
    const name = document.getElementById('volunteer-name').value.trim();
    const phone = document.getElementById('volunteer-phone').value.trim();
    const relationship = document.getElementById('volunteer-relationship').value;

    if (!name || !phone) {
      alert('Please fill in all required fields.');
      return;
    }

    // Validate phone number (basic validation)
    if (!/^\+?[\d\s\-\(\)]+$/.test(phone)) {
      alert('Please enter a valid phone number.');
      return;
    }

    // Check if volunteer already exists
    if (this.volunteers.some(v => v.phone === phone)) {
      alert('A volunteer with this phone number already exists.');
      return;
    }

    const volunteer = {
      id: Date.now().toString(),
      name: name,
      phone: phone,
      relationship: relationship,
      addedAt: new Date().toISOString()
    };

    this.volunteers.push(volunteer);
    console.log('👥 Volunteer added to popup:', volunteer);
    console.log('👥 Total volunteers in popup:', this.volunteers.length);
    
    await this.saveData();
    this.updateVolunteersList();
    
    // Clear form
    document.getElementById('volunteer-name').value = '';
    document.getElementById('volunteer-phone').value = '';
    document.getElementById('volunteer-relationship').value = 'Friend';

    // Show success message
    this.showMessage('Volunteer added successfully!', 'success');
  }

  removeVolunteer(volunteerId) {
    if (confirm('Are you sure you want to remove this volunteer?')) {
      this.volunteers = this.volunteers.filter(v => v.id !== volunteerId);
      this.saveData();
      this.updateVolunteersList();
      this.showMessage('Volunteer removed successfully!', 'success');
    }
  }

  updateVolunteersList() {
    const volunteersList = document.getElementById('volunteers-list');
    
    if (this.volunteers.length === 0) {
      volunteersList.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">👥</div>
          <p>No volunteers added yet</p>
          <p style="font-size: 12px; color: #999;">Add a volunteer to enable OTP access</p>
        </div>
      `;
      return;
    }

    volunteersList.innerHTML = this.volunteers.map(volunteer => `
      <div class="volunteer-item">
        <div class="volunteer-name">${volunteer.name}</div>
        <div class="volunteer-details">
          📞 ${volunteer.phone}<br>
          👤 ${volunteer.relationship}<br>
          📅 Added: ${new Date(volunteer.addedAt).toLocaleDateString()}
        </div>
        <button class="btn btn-danger btn-small" onclick="window.popupManager.removeVolunteer('${volunteer.id}')" style="margin-top: 10px;">
          Remove
        </button>
      </div>
    `).join('');
  }

  updateDailyLimits() {
    const today = new Date().toDateString();
    const categories = ['adult', 'piracy', 'gambling', 'social'];
    
    categories.forEach(category => {
      const key = `${today}_${category}`;
      const count = this.dailyLimits[key] || 0;
      document.getElementById(`${category}-count`).textContent = count;
    });
  }

  loadSettings() {
    document.getElementById('otp-enabled').checked = this.settings.otpEnabled;
    document.getElementById('daily-limits-enabled').checked = this.settings.dailyLimitsEnabled;
    document.getElementById('volunteer-required').checked = this.settings.volunteerRequired;
    document.getElementById('otp-expiry').value = this.settings.otpExpiryMinutes;
  }

  saveSettings() {
    this.settings = {
      otpEnabled: document.getElementById('otp-enabled').checked,
      dailyLimitsEnabled: document.getElementById('daily-limits-enabled').checked,
      volunteerRequired: document.getElementById('volunteer-required').checked,
      otpExpiryMinutes: parseInt(document.getElementById('otp-expiry').value)
    };

    this.saveData();
    this.showMessage('Settings saved successfully!', 'success');
  }

  updateUI() {
    this.updateVolunteersList();
    this.updateDailyLimits();
  }

  showMessage(message, type = 'info') {
    // Create a temporary message element
    const messageDiv = document.createElement('div');
    messageDiv.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${type === 'success' ? '#4caf50' : type === 'error' ? '#f44336' : '#2196f3'};
      color: white;
      padding: 12px 20px;
      border-radius: 6px;
      font-size: 14px;
      z-index: 1000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
    messageDiv.textContent = message;
    
    document.body.appendChild(messageDiv);
    
    // Remove after 3 seconds
    setTimeout(() => {
      if (messageDiv.parentNode) {
        messageDiv.parentNode.removeChild(messageDiv);
      }
    }, 3000);
  }
}

// Initialize popup manager
const popupManager = new PopupManager();
window.popupManager = popupManager;
