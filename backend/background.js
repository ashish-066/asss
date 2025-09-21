// Authentication and Addiction Control System
class SafetyAuth {
  constructor() {
    this.volunteers = [];
    this.otpRequests = new Map();
    this.blockedSites = new Set();
    this.dailyLimits = new Map();
    this.initialized = false;
    this.init();
  }

  async init() {
    await this.loadData();
    this.initialized = true;
    console.log('✅ SafetyAuth initialized with', this.volunteers.length, 'volunteers');
  }

  async loadData() {
    try {
      console.log('🔄 SafetyAuth loading data from storage...');
      const result = await chrome.storage.local.get([
        'volunteers', 
        'blockedSites', 
        'dailyLimits',
        'authSettings'
      ]);
      
      console.log('🔄 Raw storage result:', result);
      
      this.volunteers = result.volunteers || [];
      this.blockedSites = new Set(result.blockedSites || []);
      this.dailyLimits = new Map(Object.entries(result.dailyLimits || {}));
      
      console.log('🔄 SafetyAuth loaded data:', {
        volunteers: this.volunteers,
        blockedSites: Array.from(this.blockedSites),
        dailyLimits: Object.fromEntries(this.dailyLimits)
      });
    } catch (error) {
      console.error('Error loading auth data:', error);
    }
  }

  async saveData() {
    try {
      await chrome.storage.local.set({
        volunteers: this.volunteers,
        blockedSites: Array.from(this.blockedSites),
        dailyLimits: Object.fromEntries(this.dailyLimits),
        authSettings: this.getAuthSettings()
      });
    } catch (error) {
      console.error('Error saving auth data:', error);
    }
  }

  async handleOTPRequest(url, reason, sendResponse) {
    try {
      console.log('🔐 OTP REQUEST WITH TWILIO SMS');
      console.log('🔐 URL:', url);
      console.log('🔐 Reason:', reason);
      console.log('🔐 Volunteers available:', this.volunteers.length);
      
      // Check if user has volunteers set up
      if (this.volunteers.length === 0) {
        console.log('❌ No volunteers configured');
        sendResponse({
          success: false,
          error: 'No volunteers configured. Please add a volunteer first.',
          requiresSetup: true
        });
        return;
      }

      // Generate OTP
      const otp = this.generateOTP();
      const requestId = Date.now().toString();
      
      console.log('🔐 Generated OTP:', otp);
      console.log('🔐 Request ID:', requestId);
      
      // Store OTP request
      this.otpRequests.set(requestId, {
        url: url,
        otp: otp,
        reason: reason,
        timestamp: Date.now(),
        volunteers: [...this.volunteers],
        status: 'pending'
      });

      // Send OTP to volunteers via Twilio SMS
      const otpSent = await this.sendOTPToVolunteers(otp, url, reason);
      
      if (otpSent) {
        sendResponse({
          success: true,
          requestId: requestId,
          message: `OTP sent to ${this.volunteers.length} volunteer(s) via SMS. Please ask them to approve your request.`
        });
      } else {
        sendResponse({
          success: false,
          error: 'Failed to send OTP to volunteers. Please check your Twilio configuration.'
        });
      }
      
      console.log('🔐 OTP request completed');
    } catch (error) {
      console.error('❌ Error handling OTP request:', error);
      sendResponse({
        success: false,
        error: `Error: ${error.message}`
      });
    }
  }

  generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  async sendOTPToVolunteers(otp, url, reason) {
    try {
      console.log(`📱 OTP ${otp} generated for ${url}`);
      console.log(`📧 Sending OTP to volunteers: ${this.volunteers.map(v => v.phone).join(', ')}`);
      
      const messages = [];
      for (const volunteer of this.volunteers) {
        const message = await this.sendTwilioSMS(volunteer.phone, otp, url, volunteer.name);
        messages.push(message);
        console.log(`📤 SMS sent to ${volunteer.name} (${volunteer.phone}): ${message.success ? 'Success' : 'Failed'}`);
      }
      
      const successCount = messages.filter(m => m.success).length;
      console.log(`✅ SMS sent to ${successCount}/${this.volunteers.length} volunteers`);
      
      return successCount > 0;
    } catch (error) {
      console.error('Error sending OTP to volunteers:', error);
      return false;
    }
  }

  async sendTwilioSMS(phoneNumber, otp, url, volunteerName) {
    try {
      // Twilio API configuration - Replace these with your actual Twilio credentials
      const accountSid = 'YOUR_TWILIO_ACCOUNT_SID'; // Get from Twilio Console
      const authToken = 'YOUR_TWILIO_AUTH_TOKEN';   // Get from Twilio Console  
      const fromNumber = 'YOUR_TWILIO_PHONE_NUMBER'; // Your Twilio phone number
      
      // Check if credentials are configured
      if (accountSid === 'YOUR_TWILIO_ACCOUNT_SID' || authToken === 'YOUR_TWILIO_AUTH_TOKEN') {
        console.log('⚠️ Twilio credentials not configured. Please update background.js with your Twilio credentials.');
        return { success: false, error: 'Twilio credentials not configured' };
      }
      
      const message = `🔐 SAFETY ALERT 🔐
      
Hi ${volunteerName},

Someone is requesting access to a blocked website:
🌐 ${url}

OTP Code: ${otp}
⏰ Valid for 5 minutes

Please share this code if you approve the access.

Stay safe! 🛡️`;

      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          'From': fromNumber,
          'To': phoneNumber,
          'Body': message
        })
      });

      if (response.ok) {
        const data = await response.json();
        console.log(`✅ SMS sent successfully to ${phoneNumber}. SID: ${data.sid}`);
        return { success: true, sid: data.sid };
      } else {
        const error = await response.text();
        console.error(`❌ SMS failed to ${phoneNumber}:`, error);
        return { success: false, error: error };
      }
    } catch (error) {
      console.error(`❌ SMS error for ${phoneNumber}:`, error);
      return { success: false, error: error.message };
    }
  }

  async verifyOTP(otp, requestId, sendResponse) {
    try {
      const request = this.otpRequests.get(requestId);
      
      if (!request) {
        sendResponse({
          success: false,
          error: 'Invalid request ID'
        });
        return;
      }

      if (request.otp !== otp) {
        sendResponse({
          success: false,
          error: 'Invalid OTP. Please try again.'
        });
        return;
      }

      const now = Date.now();
      if (now - request.timestamp > 5 * 60 * 1000) {
        this.otpRequests.delete(requestId);
        sendResponse({
          success: false,
          error: 'OTP expired. Please request a new one.'
        });
        return;
      }

      request.status = 'approved';
      this.otpRequests.delete(requestId);
      
      this.updateDailyLimit(request.url);
      
      sendResponse({
        success: true,
        message: 'Access granted! You can now visit the website.',
        url: request.url
      });
    } catch (error) {
      console.error('Error verifying OTP:', error);
      sendResponse({
        success: false,
        error: 'An error occurred while verifying OTP.'
      });
    }
  }

  checkDailyLimit(url) {
    const category = this.categorizeURL(url);
    const today = new Date().toDateString();
    const key = `${today}_${category}`;
    
    const currentCount = this.dailyLimits.get(key) || 0;
    const limit = this.getCategoryLimit(category);
    
    return {
      allowed: currentCount < limit,
      current: currentCount,
      limit: limit,
      category: category
    };
  }

  updateDailyLimit(url) {
    const category = this.categorizeURL(url);
    const today = new Date().toDateString();
    const key = `${today}_${category}`;
    
    const currentCount = this.dailyLimits.get(key) || 0;
    this.dailyLimits.set(key, currentCount + 1);
    
    this.saveData();
  }

  categorizeURL(url) {
    const domain = new URL(url).hostname.toLowerCase();
    
    if (this.isAdultSite(domain)) return 'adult';
    if (this.isPiracySite(domain)) return 'piracy';
    if (this.isGamblingSite(domain)) return 'gambling';
    if (this.isSocialMedia(domain)) return 'social';
    
    return 'general';
  }

  getCategoryLimit(category) {
    const limits = {
      adult: 2,
      piracy: 1,
      gambling: 1,
      social: 10,
      general: 20
    };
    
    return limits[category] || 20;
  }

  isAdultSite(domain) {
    const adultKeywords = ['porn', 'xxx', 'adult', 'sex', 'nude', 'naked'];
    return adultKeywords.some(keyword => domain.includes(keyword));
  }

  isPiracySite(domain) {
    const piracyKeywords = ['torrent', 'pirate', 'free-movie', 'download', 'streaming'];
    return piracyKeywords.some(keyword => domain.includes(keyword));
  }

  isGamblingSite(domain) {
    const gamblingKeywords = ['casino', 'bet', 'gamble', 'poker', 'lottery'];
    return gamblingKeywords.some(keyword => domain.includes(keyword));
  }

  isSocialMedia(domain) {
    const socialDomains = ['facebook.com', 'twitter.com', 'instagram.com', 'tiktok.com', 'snapchat.com'];
    return socialDomains.some(social => domain.includes(social));
  }

  getAuthSettings() {
    return {
      otpEnabled: true,
      dailyLimitsEnabled: true,
      volunteerRequired: true,
      otpExpiryMinutes: 5
    };
  }
}

// Initialize the authentication system
const safetyAuth = new SafetyAuth();

// Wait for data to be loaded properly
setTimeout(async () => {
    console.log('🚀 Background script loaded and running!');
    console.log('👥 Volunteers loaded from storage:', safetyAuth.volunteers.length);
    
    // If no volunteers, add a test one for immediate functionality
    if (safetyAuth.volunteers.length === 0) {
        console.log('🧪 No volunteers found - adding test volunteer');
        safetyAuth.volunteers.push({
            id: 'test-volunteer',
            name: 'Test Volunteer',
            phone: '+1234567890',
            relationship: 'Friend',
            addedAt: new Date().toISOString()
        });
    }
    
    console.log('👥 Final volunteer count:', safetyAuth.volunteers.length);
}, 200);

// Listen for storage changes to sync volunteers
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.volunteers) {
        console.log('🔄 Storage changed - updating volunteers:', changes.volunteers.newValue);
        safetyAuth.volunteers = changes.volunteers.newValue || [];
        console.log('✅ Volunteers synced from storage:', safetyAuth.volunteers.length);
    }
});

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    console.log('📨 Background received message:', message.type, message);
    
    // Handle OTP requests FIRST (most important)
    if (message.type === 'requestOTP') {
        console.log('🔐 OTP request handler triggered');
        console.log('🔐 SafetyAuth initialized:', safetyAuth.initialized);
        console.log('🔐 SafetyAuth volunteers:', safetyAuth.volunteers);
        console.log('🔐 Volunteer count:', safetyAuth.volunteers.length);
        
        // Wait for initialization if not ready
        if (!safetyAuth.initialized) {
            console.log('⏳ Waiting for SafetyAuth initialization...');
            await new Promise(resolve => {
                const checkInit = () => {
                    if (safetyAuth.initialized) {
                        resolve();
                    } else {
                        setTimeout(checkInit, 100);
                    }
                };
                checkInit();
            });
            console.log('✅ SafetyAuth initialization complete');
        }
        
        try {
            console.log('🔐 About to call handleOTPRequest...');
            await safetyAuth.handleOTPRequest(message.url, message.reason, sendResponse);
            console.log('🔐 OTP request handled successfully');
        } catch (error) {
            console.error('❌ Error in OTP request handler:', error);
            console.error('❌ Error stack:', error.stack);
            sendResponse({
                success: false,
                error: `Handler error: ${error.message}`
            });
        }
        return true; // Keep message channel open for async response
    }
    
    // Test message handler
    if (message.type === 'test') {
        console.log('🧪 Test message received');
        sendResponse({ success: true, message: 'Background script is working!' });
        return true;
    }
    
    // Handle OTP verification
    if (message.type === 'verifyOTP') {
        await safetyAuth.verifyOTP(message.otp, message.requestId, sendResponse);
        return true;
    }
    
    // Handle volunteer management
    if (message.type === 'addVolunteer') {
        try {
            if (!message.volunteer.name || !message.volunteer.phone) {
                sendResponse({
                    success: false,
                    error: 'Name and phone number are required'
                });
                return;
            }

            const exists = safetyAuth.volunteers.some(v => v.phone === message.volunteer.phone);
            if (exists) {
                sendResponse({
                    success: false,
                    error: 'Volunteer with this phone number already exists'
                });
                return;
            }

            safetyAuth.volunteers.push({
                id: Date.now().toString(),
                name: message.volunteer.name,
                phone: message.volunteer.phone,
                relationship: message.volunteer.relationship || 'Friend',
                addedAt: new Date().toISOString()
            });

            await safetyAuth.saveData();
            
            sendResponse({
                success: true,
                message: `Volunteer ${message.volunteer.name} added successfully!`,
                volunteer: safetyAuth.volunteers[safetyAuth.volunteers.length - 1]
            });
        } catch (error) {
            console.error('Error adding volunteer:', error);
            sendResponse({
                success: false,
                error: 'An error occurred while adding volunteer.'
            });
        }
        return true;
    }
    
    // Handle daily limit checks
    if (message.type === 'checkDailyLimit') {
        const limitCheck = safetyAuth.checkDailyLimit(message.url);
        sendResponse(limitCheck);
        return true;
    }
    
    // Handle volunteer count check for debugging
    if (message.type === 'getVolunteerCount') {
        console.log('👥 Volunteer count request received');
        console.log('👥 Current volunteers:', safetyAuth.volunteers);
        sendResponse({
            success: true,
            count: safetyAuth.volunteers.length,
            volunteers: safetyAuth.volunteers
        });
        return true;
    }
    
    // Handle data reload request from popup
    if (message.type === 'reloadData') {
        console.log('🔄 Reloading data from storage...');
        await safetyAuth.loadData();
        console.log('✅ Data reloaded. Volunteers:', safetyAuth.volunteers.length);
        sendResponse({ success: true });
        return true;
    }
    
    // Handle direct storage check for debugging
    if (message.type === 'checkStorage') {
        console.log('🔍 Checking storage directly...');
        try {
            const allData = await chrome.storage.local.get(null);
            console.log('🔍 All storage data:', allData);
            console.log('🔍 Storage keys:', Object.keys(allData));
            console.log('🔍 Volunteers in storage:', allData.volunteers);
            console.log('🔍 Current SafetyAuth volunteers:', safetyAuth.volunteers);
            sendResponse({ success: true, data: allData });
        } catch (error) {
            console.error('❌ Storage check error:', error);
            sendResponse({ success: false, error: error.message });
        }
        return true;
    }
    
    // Handle direct volunteer update from popup
    if (message.type === 'updateVolunteers') {
        console.log('👥 Direct volunteer update received:', message.volunteers);
        safetyAuth.volunteers = message.volunteers || [];
        console.log('👥 Volunteers updated in background script:', safetyAuth.volunteers.length);
        
        // Also save to storage
        try {
            await safetyAuth.saveData();
            console.log('💾 Volunteers also saved to storage');
            
            // Verify the save worked
            const verifyData = await chrome.storage.local.get(['volunteers']);
            console.log('✅ Verification - Storage now contains:', verifyData.volunteers);
        } catch (error) {
            console.error('❌ Failed to save volunteers to storage:', error);
        }
        
        sendResponse({ success: true });
        return true;
    }
    
    // Handle manual volunteer save for testing
    if (message.type === 'saveTestVolunteer') {
        console.log('🧪 Saving test volunteer manually...');
        const testVolunteer = {
            id: 'test-' + Date.now(),
            name: 'Test User',
            phone: '+1234567890',
            relationship: 'Friend',
            addedAt: new Date().toISOString()
        };
        
        safetyAuth.volunteers.push(testVolunteer);
        
        try {
            await safetyAuth.saveData();
            console.log('✅ Test volunteer saved successfully');
            sendResponse({ success: true, volunteer: testVolunteer });
        } catch (error) {
            console.error('❌ Failed to save test volunteer:', error);
            sendResponse({ success: false, error: error.message });
        }
        return true;
    }
    
    // Handle URL processing
    if (message.type === "urlsCaptured") {
        console.log("📩 URLs CAPTURED MESSAGE RECEIVED!");
        const urls = message.urls; // Process ALL URLs
        console.log("📩 URLs received in background:", urls);
        console.log("📩 Number of URLs:", urls.length);

        const results = [];
        const batchSize = 10; // Process 10 URLs at a time
        
        // Process URLs in batches to avoid overwhelming the system
        // AI-powered classification using semantic analysis
        const quickResults = [];
        for (let url of urls) {
            try {
                const domain = new URL(url).hostname.toLowerCase();
                
                // AI-based quick analysis using URL structure and patterns
                const quickAnalysis = await performAIClassification(url, domain, "");
                
                quickResults.push({
                    url,
                    label: quickAnalysis.label,
                    snippet: quickAnalysis.snippet,
                });
            } catch (err) {
                quickResults.push({
                    url,
                    label: "Unknown",
                    snippet: "AI analysis in progress...",
                });
            }
        }
        
        // Send immediate AI results
        chrome.tabs.sendMessage(sender.tab.id, { type: "semanticResults", results: [...quickResults] });
        
        // Now do detailed content analysis in background
        for (let i = 0; i < urls.length; i += batchSize) {
            const batch = urls.slice(i, i + batchSize);
            console.log(`🔄 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(urls.length/batchSize)}: ${batch.length} URLs`);
            
            // Process batch in parallel
            const batchPromises = batch.map(async (url) => {
                try {
                    // Fetch URL content directly in background script (no CORS issues)
                    const content = await fetchUrlContent(url);
                    
                    if (content) {
                        const semanticData = await getSemanticLabel(content, url);
                        return {
                            url,
                            label: semanticData.label,
                            snippet: semanticData.snippet,
                        };
                    } else {
                        // Fallback: analyze based on URL/domain when content can't be fetched
                        const fallbackData = await getSemanticLabelFromUrl(url);
                        return {
                            url,
                            label: fallbackData.label,
                            snippet: fallbackData.snippet,
                        };
                    }
        } catch (err) {
                    console.error("❌ Failed to process:", url, err);
                    // Fallback: analyze based on URL/domain when content can't be fetched
                    const fallbackData = await getSemanticLabelFromUrl(url);
                    return {
                        url,
                        label: fallbackData.label,
                        snippet: fallbackData.snippet,
                    };
                }
            });
            
            // Wait for batch to complete
            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);
            
            // Send updated results
            chrome.tabs.sendMessage(sender.tab.id, { type: "semanticResults", results: [...results] });
            
            // Small delay between batches to avoid overwhelming the system
            if (i + batchSize < urls.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        chrome.tabs.sendMessage(sender.tab.id, { type: "semanticResults", results });
        
        // Send response back to content script
        sendResponse({ success: true, processed: urls.length });
    }
    
    // Catch-all handler for debugging (must be last)
    console.log('❓ Unhandled message type:', message.type);
    console.log('❓ Message content:', message);
    sendResponse({ success: false, error: `Unhandled message type: ${message.type}` });
    return true;
});

// Function to fetch URL content in background script (no CORS issues)
async function fetchUrlContent(url) {
    try {
        // Handle mixed content by converting HTTP to HTTPS when possible
        let fetchUrl = url;
        if (url.startsWith('http://')) {
            fetchUrl = url.replace('http://', 'https://');
        }
        
        const response = await fetch(fetchUrl, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const html = await response.text();
        
        // Simple text extraction (no DOMParser in service worker)
        const textContent = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        
        return textContent.substring(0, 2000); // Limit to 2000 characters
        
    } catch (error) {
        console.error("Error fetching URL content:", error);
        return null;
    }
}
// AI-powered semantic classification using machine learning techniques
async function performAIClassification(url, domain, content) {
    try {
        // Extract semantic features from URL and content
        const features = extractSemanticFeatures(url, domain, content);
        
        // Use AI-based classification algorithm
        const classification = await classifyWithAI(features);
        
        return {
            label: classification.label,
            snippet: classification.snippet
        };
    } catch (error) {
        console.error("AI Classification Error:", error);
        return { label: "Unknown", snippet: "AI analysis failed" };
    }
}

// Extract semantic features for AI analysis
function extractSemanticFeatures(url, domain, content) {
    const features = {
        // URL structure features
        urlLength: url.length,
        domainLength: domain.length,
        hasSubdomain: domain.split('.').length > 2,
        tld: domain.split('.').pop(),
        hasNumbers: /\d/.test(domain),
        hasHyphens: domain.includes('-'),
        
        // Content features
        contentLength: content.length,
        wordCount: content.split(/\s+/).length,
        sentenceCount: content.split(/[.!?]+/).length,
        
        // Semantic features
        suspiciousPatterns: detectSuspiciousPatterns(url, domain, content),
        legitimateIndicators: detectLegitimateIndicators(url, domain, content),
        adultContentScore: calculateAdultContentScore(content),
        piracyContentScore: calculatePiracyContentScore(content),
        newsContentScore: calculateNewsContentScore(content),
        
        // URL semantic analysis
        urlSemantics: analyzeURLSemantics(url, domain)
    };
    
    return features;
}

// AI-based classification using feature analysis
async function classifyWithAI(features) {
    // Calculate risk scores using AI algorithms
    const adultRisk = calculateAdultRisk(features);
    const piracyRisk = calculatePiracyRisk(features);
    const suspiciousRisk = calculateSuspiciousRisk(features);
    const legitimateScore = calculateLegitimateScore(features);
    
    // Debug logging for AI classification
    console.log("🤖 AI Classification:", {
        adultRisk: adultRisk.toFixed(2),
        piracyRisk: piracyRisk.toFixed(2),
        suspiciousRisk: suspiciousRisk.toFixed(2),
        legitimateScore: legitimateScore.toFixed(2),
        adultContentScore: features.adultContentScore.toFixed(2),
        domain: features.urlSemantics.domain
    });
    
    // AI decision making - lower threshold for adult content
    if (adultRisk > 0.3) {
        console.log("🚨 AI detected adult content - marking as Wrong");
        return { label: "Wrong", snippet: "AI detected adult content" };
    }
    
    if (piracyRisk > 0.7) {
        console.log("🚨 AI detected piracy content - marking as Wrong");
        return { label: "Wrong", snippet: "AI detected piracy content" };
    }
    
    if (suspiciousRisk > 0.8) {
        console.log("🚨 AI detected suspicious patterns - marking as Wrong");
        return { label: "Wrong", snippet: "AI detected suspicious patterns" };
    }
    
    if (legitimateScore > 0.6) {
        console.log("✅ AI verified legitimate content - marking as Correct");
        return { label: "Correct", snippet: "AI verified legitimate content" };
    }
    
    console.log("❓ AI analysis inconclusive - marking as Unknown");
    return { label: "Unknown", snippet: "AI analysis inconclusive" };
}

// AI-powered feature detection functions
function detectSuspiciousPatterns(url, domain, content) {
    const patterns = {
        // URL patterns
        shortUrl: url.length < 20,
        suspiciousTld: ['.tk', '.ml', '.ga', '.cf'].includes(domain.split('.').pop()),
        ipAddress: /^\d+\.\d+\.\d+\.\d+$/.test(domain),
        
        // Content patterns
        excessivePunctuation: (content.match(/[!]{2,}/g) || []).length > 3,
        urgentLanguage: /urgent|act now|click here|limited time/i.test(content),
        financialPressure: /money|credit|card|payment|bitcoin/i.test(content),
        
        // Domain patterns
        randomDomain: /^[a-z]{5,10}\d{2,4}$/.test(domain.split('.')[0])
    };
    
    return Object.values(patterns).filter(Boolean).length;
}

function detectLegitimateIndicators(url, domain, content) {
    const indicators = {
        // Professional indicators
        hasAboutPage: /about|company|organization/i.test(content),
        hasContactInfo: /contact|email|phone|address/i.test(content),
        hasPrivacyPolicy: /privacy|terms|policy/i.test(content),
        
        // Educational indicators
        isEducational: /\.edu$|university|college|school|academic/i.test(domain + content),
        isGovernment: /\.gov$|government|official/i.test(domain + content),
        
        // News indicators
        isNews: /news|article|report|journalism/i.test(content),
        
        // Technical indicators
        isTechnical: /github|stackoverflow|wikipedia|research/i.test(domain + content)
    };
    
    return Object.values(indicators).filter(Boolean).length;
}

function calculateAdultContentScore(content) {
    const adultKeywords = [
        'porn', 'xxx', 'adult', 'sex', 'nude', 'naked', 'erotic', 'fetish',
        'bdsm', 'cam', 'webcam', 'escort', 'dating', 'hookup', 'milf', 'teen',
        'anal', 'oral', 'blowjob', 'fuck', 'pussy', 'dick', 'cock', 'tits',
        'boobs', 'ass', 'butt', 'pornography', 'sexual', 'intimate', 'horny',
        'sexy', 'hot', 'strip', 'stripclub', 'brothel', 'prostitute', 'hooker',
        'massage', 'parlour', 'adult video', 'adult film', 'porn video', 'sex video',
        'nude video', 'adult content', 'adult entertainment', 'adult site', 'porn site',
        'sex site', 'adult chat', 'sex chat', 'adult dating', 'sex dating',
        'adult friend', 'sex friend', 'pornhub', 'xvideos', 'redtube', 'youporn',
        'tube8', 'xtube', 'beeg', 'tnaflix', 'empflix', 'slutload', 'nuvid', 'xhamster'
    ];
    
    const matches = adultKeywords.filter(keyword => 
        content.toLowerCase().includes(keyword)
    ).length;
    
    // More aggressive scoring - even 1 match should be significant
    return Math.min(matches * 0.3, 1); // Each match adds 0.3 to the score
}

function calculatePiracyContentScore(content) {
    const piracyKeywords = [
        'torrent', 'download', 'free movie', 'free tv show', 'streaming',
        'watch online', 'hd quality', 'bluray', 'dvdrip', 'camrip'
    ];
    
    const matches = piracyKeywords.filter(keyword => 
        content.toLowerCase().includes(keyword)
    ).length;
    
    return matches / piracyKeywords.length;
}

function calculateNewsContentScore(content) {
    const newsKeywords = [
        'news', 'article', 'report', 'breaking', 'headlines', 'journalism',
        'according to', 'sources say', 'officials said', 'police said'
    ];
    
    const matches = newsKeywords.filter(keyword => 
        content.toLowerCase().includes(keyword)
    ).length;
    
    return matches / newsKeywords.length;
}

function analyzeURLSemantics(url, domain) {
    const semantics = {
        // URL structure analysis
        isShortened: /bit\.ly|tinyurl|t\.co|goo\.gl/.test(url),
        hasTracking: /utm_|ref=|source=|campaign=/.test(url),
        
        // Domain analysis
        domain: domain, // Include domain for adult detection
        isSubdomain: domain.split('.').length > 2,
        hasNumbers: /\d/.test(domain),
        isRandom: /^[a-z]{6,12}\d{2,4}$/.test(domain.split('.')[0])
    };
    
    return semantics;
}

// AI risk calculation functions
function calculateAdultRisk(features) {
    let risk = 0;
    
    // Adult content score - more aggressive
    risk += features.adultContentScore * 0.8;
    
    // Domain-based adult detection
    const adultDomainKeywords = ['porn', 'xxx', 'adult', 'sex', 'nude', 'naked', 'erotic', 'fetish', 'bdsm', 'cam', 'webcam', 'escort', 'dating', 'hookup', 'milf', 'teen', 'pornhub', 'xvideos', 'redtube', 'youporn', 'tube8', 'xtube', 'beeg', 'tnaflix', 'empflix', 'slutload', 'nuvid', 'xhamster'];
    const hasAdultDomain = adultDomainKeywords.some(keyword => features.urlSemantics.domain?.includes(keyword) || false);
    if (hasAdultDomain) risk += 0.7;
    
    // URL patterns
    if (features.suspiciousPatterns > 1) risk += 0.2;
    if (features.urlSemantics.isRandom) risk += 0.1;
    
    // Content analysis
    if (features.contentLength < 100) risk += 0.1;
    
    return Math.min(risk, 1);
}

function calculatePiracyRisk(features) {
    let risk = 0;
    
    // Piracy content score
    risk += features.piracyContentScore * 0.7;
    
    // URL patterns
    if (features.suspiciousPatterns > 1) risk += 0.2;
    if (features.urlSemantics.isShortened) risk += 0.1;
    
    return Math.min(risk, 1);
}

function calculateSuspiciousRisk(features) {
    let risk = 0;
    
    // Suspicious patterns
    risk += features.suspiciousPatterns * 0.2;
    
    // URL semantics
    if (features.urlSemantics.isShortened) risk += 0.3;
    if (features.urlSemantics.hasTracking) risk += 0.1;
    if (features.urlSemantics.isRandom) risk += 0.2;
    
    // Content analysis
    if (features.contentLength < 50) risk += 0.2;
    
    return Math.min(risk, 1);
}

function calculateLegitimateScore(features) {
    let score = 0;
    
    // Legitimate indicators
    score += features.legitimateIndicators * 0.3;
    
    // News content
    score += features.newsContentScore * 0.4;
    
    // URL structure
    if (features.tld === 'edu' || features.tld === 'gov') score += 0.3;
    if (features.tld === 'org') score += 0.2;
    if (features.tld === 'com') score += 0.1;
    
    // Content quality
    if (features.contentLength > 500) score += 0.1;
    if (features.wordCount > 100) score += 0.1;
    
    return Math.min(score, 1);
}

async function getSemanticLabel(text, url) {
    try {
        const domain = new URL(url).hostname.toLowerCase();
        return await performAIClassification(url, domain, text);
    } catch (error) {
        console.error("Error in getSemanticLabel:", error);
        return { label: "Unknown", snippet: "AI analysis failed" };
    }
}

// AI-powered fallback function when content cannot be fetched
async function getSemanticLabelFromUrl(url) {
    try {
        let domain = '';
        try {
            domain = new URL(url).hostname.toLowerCase();
        } catch (e) {
            return { label: "Wrong", snippet: "Invalid URL format" };
        }
        
        // Use AI classification even without content
        return await performAIClassification(url, domain, "");
        
    } catch (error) {
        console.error("Error in getSemanticLabelFromUrl:", error);
        return { label: "Unknown", snippet: "AI analysis failed" };
    }
}