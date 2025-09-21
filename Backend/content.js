// Debug: Check if content script is running
console.log("🚀 Content script loaded and running!");

// Wait for page to be fully loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', processLinks);
} else {
  processLinks();
}

function processLinks() {
  console.log("📄 Page loaded, processing links...");
  
  // Grab all links on the page, but exclude Google's own elements
const links = Array.from(document.querySelectorAll('a'))
  .map(a => a.href)
    .filter(href => {
      // Only process external links, not Google's own navigation/UI
      return href.startsWith('http') && 
             !href.includes('mcafee') &&
             !href.includes('google.com') &&
             !href.includes('googleusercontent.com') &&
             !href.includes('gstatic.com') &&
             !href.includes('googleapis.com') &&
             !href.includes('youtube.com') && // YouTube is generally safe
             !href.includes('wikipedia.org'); // Wikipedia is generally safe
    });

console.log("🔗 Found", links.length, "filtered links");
  console.log("🔗 Links:", links);

// Send URLs to background for processing
chrome.runtime.sendMessage({ type: "urlsCaptured", urls: links }, () => {
  if (chrome.runtime.lastError) {
    console.warn("Message send error (ignored):", chrome.runtime.lastError.message);
  }
});
}

// Listen for results from background
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "semanticResults") {
    console.log("📊 Semantic results received:", message.results.length, "results");
    displayResults(message.results);
  }
});

// Function to add symbols next to links in search results
function displayResults(results) {
  console.log("📊 Adding symbols to links:", results.length, "results");
  
  // Remove loading indicators
  const loadingIndicators = document.querySelectorAll('.safety-loading');
  loadingIndicators.forEach(indicator => indicator.remove());
  
  results.forEach(result => {
    // Find all links on the page that match this URL
    const links = document.querySelectorAll('a[href]');
    
    links.forEach(link => {
      if (link.href === result.url) {
        // Remove any existing symbols, loading indicators, or chatbot symbols
        const existingElements = link.parentNode.querySelectorAll('.safety-symbol, .safety-loading, .safety-chatbot');
        existingElements.forEach(element => element.remove());
        
        // Create symbol element
        const symbol = document.createElement('span');
        symbol.className = 'safety-symbol';
        symbol.style.marginLeft = '8px';
        symbol.style.fontSize = '18px';
        symbol.style.fontWeight = 'bold';
        symbol.style.display = 'inline-block';
        symbol.style.verticalAlign = 'middle';
        symbol.style.cursor = 'help';
        symbol.title = `Safety: ${result.label} - ${result.snippet}`;
        
        // Set symbol based on classification
        if (result.label === "Wrong") {
          symbol.textContent = '❌';
          symbol.style.color = '#d32f2f'; // Red
          
          // Block the link from opening
          link.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            showBlockedMessage(link, result);
          });
          
        } else if (result.label === "Unknown") {
          // Only show warning for Unknown if it's not "Analyzing..."
          if (result.snippet !== "Analyzing...") {
            symbol.textContent = '⚠️';
            symbol.style.color = '#f57c00'; // Orange
          } else {
            symbol.textContent = '⏳';
            symbol.style.color = '#666'; // Gray
          }
        } else if (result.label === "Correct") {
          symbol.textContent = '✅';
          symbol.style.color = '#388e3c'; // Green
        }
        
        // Insert symbol after the link
        link.parentNode.insertBefore(symbol, link.nextSibling);
        
        // Add chatbot symbol for Wrong and Unknown (not analyzing)
        if (result.label === "Wrong" || (result.label === "Unknown" && result.snippet !== "Analyzing...")) {
          const chatbotSymbol = document.createElement('span');
          chatbotSymbol.className = 'safety-chatbot';
          chatbotSymbol.textContent = '🤖';
          chatbotSymbol.style.marginLeft = '4px';
          chatbotSymbol.style.fontSize = '16px';
          chatbotSymbol.style.cursor = 'pointer';
          chatbotSymbol.style.display = 'inline-block';
          chatbotSymbol.style.verticalAlign = 'middle';
          chatbotSymbol.title = 'Ask AI about this classification';
          
          // Add click handler for chatbot
          chatbotSymbol.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openChatbot(result.url, result.label, result.snippet);
          });
          
          // Insert chatbot symbol after the main symbol
          symbol.parentNode.insertBefore(chatbotSymbol, symbol.nextSibling);
        }
        
        console.log(`✅ Added ${symbol.textContent} to ${result.url}`);
      }
    });
  });
  
  // Add loading indicators to links that haven't been processed yet
  addLoadingIndicators(results);
}

// Function to add loading indicators to unprocessed links
function addLoadingIndicators(processedResults) {
  const allLinks = document.querySelectorAll('a[href]');
  const processedUrls = new Set(processedResults.map(r => r.url));
  
  allLinks.forEach(link => {
    if (link.href && !processedUrls.has(link.href) && !link.parentNode.querySelector('.safety-symbol, .safety-loading')) {
      // Don't show loading indicators for Google's own elements
      if (isGoogleElement(link.href)) {
        return; // Skip Google elements
      }
      
      // Add loading indicator
      const loading = document.createElement('span');
      loading.className = 'safety-loading';
      loading.textContent = '⏳';
      loading.style.marginLeft = '8px';
      loading.style.fontSize = '16px';
      loading.style.color = '#666';
      loading.title = 'Analyzing safety...';
      
      link.parentNode.insertBefore(loading, link.nextSibling);
    }
  });
}

// Function to check if a URL is a Google element that should be ignored
function isGoogleElement(url) {
  const googleDomains = [
    'google.com', 'googleusercontent.com', 'gstatic.com', 'googleapis.com',
    'youtube.com', 'wikipedia.org', 'google.co.in', 'google.co.uk',
    'google.ca', 'google.com.au', 'google.de', 'google.fr'
  ];
  
  return googleDomains.some(domain => url.includes(domain));
}

// Function to show blocked message when user tries to click a wrong link
function showBlockedMessage(link, result) {
  // Create blocking overlay
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.7);
    z-index: 10000;
    display: flex;
    justify-content: center;
    align-items: center;
  `;
  
  const modal = document.createElement('div');
  modal.style.cssText = `
    background: white;
    padding: 30px;
    border-radius: 12px;
    max-width: 500px;
    text-align: center;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
  `;
  
  modal.innerHTML = `
    <div style="font-size: 48px; margin-bottom: 20px;">🚫</div>
    <h2 style="color: #d32f2f; margin-bottom: 15px;">Link Blocked for Safety</h2>
    <p style="margin-bottom: 20px; color: #666;">
      This link has been classified as <strong>${result.label}</strong> by our AI safety system.
    </p>
    <p style="margin-bottom: 25px; font-size: 14px; color: #888;">
      <strong>Reason:</strong> ${result.snippet}
    </p>
    <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
      <button id="ask-ai-btn" style="
        background: #1976d2;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
      ">🤖 Ask AI Why</button>
      <button id="request-otp-btn" style="
        background: #4caf50;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
      ">🔐 Request OTP Access</button>
      <button id="proceed-anyway-btn" style="
        background: #f57c00;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
      ">⚠️ Proceed Anyway</button>
      <button id="close-modal-btn" style="
        background: #666;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
      ">Close</button>
    </div>
  `;
  
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  
  // Event handlers
  document.getElementById('ask-ai-btn').addEventListener('click', () => {
    document.body.removeChild(overlay);
    openChatbot(result.url, result.label, result.snippet);
  });
  
  const requestOtpBtn = document.getElementById('request-otp-btn');
  if (requestOtpBtn) {
    console.log('✅ Request OTP button found, adding event listener');
    requestOtpBtn.addEventListener('click', () => {
      console.log('🔐 Request OTP button clicked!');
      console.log('URL:', result.url);
      console.log('Snippet:', result.snippet);
      document.body.removeChild(overlay);
      requestOTPAccess(result.url, result.snippet);
    });
  } else {
    console.error('❌ Request OTP button not found!');
  }
  
  document.getElementById('proceed-anyway-btn').addEventListener('click', () => {
    document.body.removeChild(overlay);
    window.open(result.url, '_blank');
  });
  
  document.getElementById('close-modal-btn').addEventListener('click', () => {
    document.body.removeChild(overlay);
  });
  
  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      document.body.removeChild(overlay);
    }
  });
}

// Function to open chatbot modal
function openChatbot(url, label, snippet) {
  // Remove existing chatbot if any
  const existingChatbot = document.getElementById('safety-chatbot');
  if (existingChatbot) {
    existingChatbot.remove();
  }
  
  // Initialize conversation memory
  const conversationHistory = [
    {
      role: 'assistant',
      content: `Hey there! I can help explain why this website was classified as **${label}**. What would you like to know about this classification?`
    }
  ];
  
  // Create chatbot overlay
  const overlay = document.createElement('div');
  overlay.id = 'safety-chatbot';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.7);
    z-index: 10001;
    display: flex;
    justify-content: center;
    align-items: center;
  `;
  
  const chatbot = document.createElement('div');
  chatbot.style.cssText = `
    background: white;
    width: 90%;
    max-width: 600px;
    height: 70%;
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
  `;
  
  chatbot.innerHTML = `
    <div style="
      background: #1976d2;
      color: white;
      padding: 20px;
      border-radius: 12px 12px 0 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    ">
      <h2 style="margin: 0; font-size: 18px;">🤖 AI Safety Assistant</h2>
      <button id="close-chatbot" style="
        background: none;
        border: none;
        color: white;
        font-size: 24px;
        cursor: pointer;
        padding: 0;
        width: 30px;
        height: 30px;
      ">×</button>
    </div>
    
    <div style="
      padding: 20px;
      flex: 1;
      overflow-y: auto;
      background: #f8f9fa;
    ">
      <div style="
        background: white;
        padding: 15px;
        border-radius: 8px;
        margin-bottom: 15px;
        border-left: 4px solid #1976d2;
      ">
        <h3 style="margin: 0 0 10px 0; color: #1976d2;">Website Analysis</h3>
        <p style="margin: 5px 0;"><strong>URL:</strong> ${url}</p>
        <p style="margin: 5px 0;"><strong>Classification:</strong> 
          <span style="color: ${label === 'Wrong' ? '#d32f2f' : label === 'Unknown' ? '#f57c00' : '#388e3c'};">
            ${label === 'Wrong' ? '❌ Blocked' : label === 'Unknown' ? '⚠️ Unknown' : '✅ Safe'}
          </span>
        </p>
        <p style="margin: 5px 0;"><strong>Reason:</strong> ${snippet}</p>
      </div>
      
      <div id="chat-messages" style="min-height: 200px;">
        <div style="
          background: #e3f2fd;
          padding: 12px;
          border-radius: 8px;
          margin-bottom: 10px;
          font-size: 14px;
        ">
          <strong>AI Assistant:</strong> Hey there! I can help explain why this website was classified as <strong>${label}</strong>. 
          What would you like to know about this classification?
        </div>
      </div>
    </div>
    
    <div style="
      padding: 20px;
      border-top: 1px solid #e0e0e0;
      background: white;
      border-radius: 0 0 12px 12px;
    ">
      <div style="display: flex; gap: 10px;">
        <input type="text" id="chat-input" placeholder="Ask about this website..." style="
          flex: 1;
          padding: 12px;
          border: 1px solid #ddd;
          border-radius: 6px;
          font-size: 14px;
        ">
        <button id="send-message" style="
          background: #1976d2;
          color: white;
          border: none;
          padding: 12px 20px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
        ">Send</button>
      </div>
      
      <div style="margin-top: 15px; display: flex; gap: 10px; flex-wrap: wrap;">
        <button class="quick-question" data-question="Why was this blocked?" style="
          background: #f5f5f5;
          border: 1px solid #ddd;
          padding: 8px 12px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 12px;
        ">Why was this blocked?</button>
        <button class="quick-question" data-question="What content was detected?" style="
          background: #f5f5f5;
          border: 1px solid #ddd;
          padding: 8px 12px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 12px;
        ">What content was detected?</button>
        <button class="quick-question" data-question="Is this a false positive?" style="
          background: #f5f5f5;
          border: 1px solid #ddd;
          padding: 8px 12px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 12px;
        ">Is this a false positive?</button>
        <button class="quick-question" data-question="How can I report this?" style="
          background: #f5f5f5;
          border: 1px solid #ddd;
          padding: 8px 12px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 12px;
        ">How can I report this?</button>
      </div>
    </div>
  `;
  
  overlay.appendChild(chatbot);
  document.body.appendChild(overlay);
  
  // Event handlers
  document.getElementById('close-chatbot').addEventListener('click', () => {
    document.body.removeChild(overlay);
  });
  
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      document.body.removeChild(overlay);
    }
  });
  
  // Send message handler
  document.getElementById('send-message').addEventListener('click', sendMessage);
  document.getElementById('chat-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      sendMessage();
    }
  });
  
  // Quick question handlers
  document.querySelectorAll('.quick-question').forEach(btn => {
    btn.addEventListener('click', () => {
      const question = btn.dataset.question;
      document.getElementById('chat-input').value = question;
      sendMessage();
    });
  });
  
  function sendMessage() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();
    if (!message) return;
    
    // Add user message to conversation history
    conversationHistory.push({ role: 'user', content: message });
    addMessage(message, 'user');
    input.value = '';
    
    // Generate AI response with conversation context
    const response = generateDynamicAIResponse(message, url, label, snippet, conversationHistory);
    
    // Add AI response to conversation history
    conversationHistory.push({ role: 'assistant', content: response });
    
    setTimeout(() => {
      addMessage(response, 'ai');
    }, 1000);
  }
  
  function addMessage(text, sender) {
    const messagesContainer = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.style.cssText = `
      background: ${sender === 'user' ? '#e3f2fd' : '#f5f5f5'};
      padding: 12px;
      border-radius: 8px;
      margin-bottom: 10px;
      font-size: 14px;
      text-align: ${sender === 'user' ? 'right' : 'left'};
      color: #333;
      border: 1px solid ${sender === 'user' ? '#bbdefb' : '#e0e0e0'};
    `;
    messageDiv.innerHTML = `<strong style="color: ${sender === 'user' ? '#1976d2' : '#666'}; font-weight: 600;">${sender === 'user' ? 'You' : 'AI Assistant'}:</strong> <span style="color: #333;">${text}</span>`;
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
  
  function generateDynamicAIResponse(question, url, label, snippet, conversationHistory) {
    const questionLower = question.toLowerCase();
    const domain = new URL(url).hostname.toLowerCase();
    
    // Analyze user intent and emotion
    const userIntent = analyzeUserIntent(question);
    const userEmotion = analyzeUserEmotion(question);
    const conversationContext = analyzeConversationContext(conversationHistory);
    
    // Debug logging
    console.log('🤖 Chatbot Debug:', {
      question: question,
      intent: userIntent,
      emotion: userEmotion,
      label: label,
      snippet: snippet
    });
    
    // Generate contextual response based on intent, emotion, and context
    return generateContextualResponse(question, url, label, snippet, userIntent, userEmotion, conversationContext, domain);
  }
  
  function analyzeUserIntent(question) {
    const q = question.toLowerCase();
    
    // Meta-conversation detection (highest priority)
    if (q.includes('repeating') || q.includes('same answer') || q.includes('you keep saying') || q.includes('you said this before')) return 'meta_repetition';
    if (q.includes('irrelevant') || q.includes('not helpful') || q.includes('doesn\'t make sense') || q.includes('not answering')) return 'meta_irrelevant';
    if (q.includes('you are') && (q.includes('stupid') || q.includes('dumb') || q.includes('useless') || q.includes('bad'))) return 'meta_criticism';
    if (q.includes('stop') || q.includes('enough') || q.includes('quit') || q.includes('shut up')) return 'meta_stop';
    if (q.includes('you don\'t understand') || q.includes('you\'re not listening') || q.includes('you\'re not getting it')) return 'meta_misunderstanding';
    
    // Regular intents (prioritize more specific ones first)
    if (q.includes('wrong') || q.includes('incorrect') || q.includes('mistake') || q.includes('false')) return 'disagreement';
    if (q.includes('safe') || q.includes('dangerous') || q.includes('risk')) return 'safety';
    if (q.includes('why') || q.includes('reason') || q.includes('cause')) return 'explanation';
    if (q.includes('how') || q.includes('work') || q.includes('process')) return 'method';
    if (q.includes('sure') || q.includes('certain') || q.includes('confident')) return 'confidence';
    if (q.includes('alternative') || q.includes('instead') || q.includes('recommend')) return 'suggestion';
    if (q.includes('report') || q.includes('feedback') || q.includes('complain')) return 'action';
    if (q.includes('understand') || q.includes('confused') || q.includes('unclear')) return 'clarification';
    if (q.includes('more') || q.includes('details') || q.includes('elaborate')) return 'detail';
    if (q.includes('what') || q.includes('show') || q.includes('tell me about')) return 'information';
    
    return 'general';
  }
  
  function analyzeUserEmotion(question) {
    const q = question.toLowerCase();
    
    if (q.includes('!') || q.includes('angry') || q.includes('frustrated') || q.includes('annoyed')) return 'frustrated';
    if (q.includes('worried') || q.includes('scared') || q.includes('concerned') || q.includes('nervous')) return 'worried';
    if (q.includes('confused') || q.includes('unclear') || q.includes('don\'t understand')) return 'confused';
    if (q.includes('skeptical') || q.includes('doubt') || q.includes('suspicious') || q.includes('not sure')) return 'skeptical';
    if (q.includes('thank') || q.includes('appreciate') || q.includes('helpful')) return 'grateful';
    if (q.includes('curious') || q.includes('wonder') || q.includes('interesting')) return 'curious';
    
    return 'neutral';
  }
  
  function analyzeConversationContext(history) {
    const recentMessages = history.slice(-4); // Last 4 messages
    const topics = [];
    const aiResponses = [];
    const userComplaints = [];
    
    recentMessages.forEach(msg => {
      if (msg.role === 'user') {
        const content = msg.content.toLowerCase();
        if (content.includes('adult') || content.includes('porn')) topics.push('adult');
        if (content.includes('piracy') || content.includes('torrent')) topics.push('piracy');
        if (content.includes('phishing') || content.includes('scam')) topics.push('phishing');
        if (content.includes('safe') || content.includes('dangerous')) topics.push('safety');
        if (content.includes('technical') || content.includes('algorithm')) topics.push('technical');
        
        // Track user complaints about AI behavior
        if (content.includes('repeating') || content.includes('same answer') || content.includes('irrelevant') || content.includes('not helpful')) {
          userComplaints.push('repetition');
        }
        if (content.includes('you are') && (content.includes('stupid') || content.includes('dumb') || content.includes('useless'))) {
          userComplaints.push('criticism');
        }
      } else if (msg.role === 'assistant') {
        aiResponses.push(msg.content);
      }
    });
    
    // Check for repetitive AI responses
    const isRepetitive = aiResponses.length > 1 && 
      aiResponses.some((response, index) => 
        index > 0 && response.includes(aiResponses[index - 1].substring(0, 50))
      );
    
    return {
      recentTopics: [...new Set(topics)],
      messageCount: history.length,
      isFollowUp: history.length > 2,
      userComplaints: [...new Set(userComplaints)],
      isRepetitive: isRepetitive,
      hasBeenCriticized: userComplaints.length > 0
    };
  }
  
  function generateContextualResponse(question, url, label, snippet, intent, emotion, context, domain) {
    // Handle meta-conversation first (highest priority)
    if (intent.startsWith('meta_')) {
      return getExplanation(intent, label, snippet, domain);
    }
    
    // If user has been complaining about repetition, be more direct
    if (context.hasBeenCriticized && !intent.startsWith('meta_')) {
      return generateDirectResponse(intent, label, snippet, domain, context);
    }
    
    // Base response components
    const responses = {
      greeting: getGreeting(emotion),
      explanation: getExplanation(intent, label, snippet, domain),
      reassurance: getReassurance(emotion, context),
      suggestion: getSuggestion(intent, label, context),
      closing: getClosing(emotion, context)
    };
    
    // Build natural response
    let response = '';
    
    // Start with appropriate greeting based on emotion
    if (emotion !== 'neutral' || context.messageCount <= 2) {
      response += responses.greeting + ' ';
    }
    
    // Add main explanation based on intent
    response += responses.explanation;
    
    // Add reassurance if user seems worried or confused
    if (emotion === 'worried' || emotion === 'confused' || emotion === 'skeptical') {
      response += ' ' + responses.reassurance;
    }
    
    // Add suggestions if appropriate
    if (intent === 'suggestion' || intent === 'action' || context.recentTopics.includes('safety')) {
      response += ' ' + responses.suggestion;
    }
    
    // Add closing based on emotion and context
    if (context.messageCount > 3 || emotion === 'grateful') {
      response += ' ' + responses.closing;
    }
    
    return response.trim();
  }
  
  function generateDirectResponse(intent, label, snippet, domain, context) {
    // Give more direct, varied responses when user has complained
    const responses = {
      explanation: `This site is "${label}" because: ${snippet}.`,
      information: `Found: ${snippet}. Site: ${domain}.`,
      method: `I found: ${snippet}. I check content, URLs, domain stuff.`,
      safety: `${label === 'Wrong' ? 'Skip this one' : label === 'Unknown' ? 'Be careful' : 'Looks good'}. Why: ${snippet}.`,
      disagreement: `I marked it "${label}" because: ${snippet}. You can report if I'm wrong.`,
      confidence: `${label === 'Wrong' ? 'Pretty sure' : label === 'Unknown' ? 'Not sure' : 'Pretty sure'} it's ${label === 'Wrong' ? 'not safe' : label === 'Unknown' ? 'unknown' : 'safe'}. Found: ${snippet}.`,
      clarification: `"${label}" = ${snippet}.`,
      detail: `Found: ${snippet}. Checked: ${domain}.`,
      general: `${label}: ${snippet}.`
    };
    
    return responses[intent] || responses.general;
  }
  
  function getGreeting(emotion) {
    const greetings = {
      frustrated: "I can tell you're frustrated - totally get it! Let me help you out here.",
      worried: "I see you're worried about this. Don't stress, I'm here to help explain what's going on.",
      confused: "I can tell this is confusing. Let me break it down in a way that makes sense.",
      skeptical: "I get it if you're skeptical about this. Let me show you what I found.",
      grateful: "Awesome, glad I could help! ",
      curious: "Good question! ",
      neutral: ""
    };
    return greetings[emotion] || "";
  }
  
  function getExplanation(intent, label, snippet, domain) {
    switch (intent) {
      case 'meta_repetition':
        return `Oh man, you're totally right! I was being super repetitive there. My bad! Let me actually help you properly this time. What do you want to know about this site?`;
      
      case 'meta_irrelevant':
        return `Yeah, you're right - I wasn't being helpful at all. Let me focus on what you actually need to know. What's bugging you about this classification?`;
      
      case 'meta_criticism':
        return `Ouch, fair point! I'm being pretty useless here. Let me try to actually help you understand what's going on with this site.`;
      
      case 'meta_stop':
        return `Got it, I'll stop being annoying. What do you want to know about this website?`;
      
      case 'meta_misunderstanding':
        return `You're right, I'm totally not getting what you need. Let me start fresh - what's your question about this site?`;
      
      case 'explanation':
        if (label === 'Unknown') {
          return `So this site got marked as "Unknown" because honestly, I couldn't figure out what it is. The analysis came back as "${snippet}" - basically means I'm stumped about whether it's safe or not.`;
        } else if (label === 'Wrong') {
          return `This site got flagged as "Wrong" because I found some sketchy stuff: ${snippet}. Basically means there's something dodgy about it that made me think it's not safe.`;
        } else {
          return `This site looks good to me! I marked it as "Correct" because ${snippet}. Seems legit based on what I could see.`;
        }
      
      case 'information':
        if (snippet === 'AI analysis inconclusive') {
          return `Honestly? I'm not sure what to make of this site. The analysis couldn't figure out if it's safe or not - that's why it's "Unknown". Sometimes I just can't tell, you know?`;
        }
        return `Here's what I found: ${snippet}. I checked out the content and URL structure of ${domain}, but that's all I could figure out.`;
      
      case 'method':
        return `So here's how I work - I basically scan the website's content, check the URL for weird patterns, look at the domain name, stuff like that. For this site, I found: ${snippet}. Pretty basic detective work, really.`;
      
      case 'safety':
        if (label === 'Wrong') {
          return `I'd stay away from this one if I were you. I found ${snippet} which made me think it's not safe. Better to be cautious, right?`;
        } else if (label === 'Unknown') {
          return `Honestly, I'm not sure about this site. I couldn't tell if it's safe or not (${snippet}), so I'd be careful if you decide to visit it.`;
        } else {
          return `This site looks fine to me! I didn't find anything worrying (${snippet}), so it should be safe to visit.`;
        }
      
      case 'disagreement':
        return `I get it if you think I'm wrong about this. I found ${snippet}, but hey, I'm not perfect. If you think this classification is off, you can totally report it and I'll learn from it.`;
      
      case 'confidence':
        if (label === 'Wrong') {
          return `I'm pretty confident this one's not safe - I found ${snippet} which is pretty clear cut.`;
        } else if (label === 'Unknown') {
          return `Honestly, I'm not that confident about this one. I found ${snippet} but I'm not 100% sure what it means.`;
        } else {
          return `I'm pretty sure this site is safe - I found ${snippet} and it all looks good to me.`;
        }
      
      case 'clarification':
        return `Let me break it down for you. When I say "${label}", I mean ${snippet}. Basically, that's what I found when I checked out the site.`;
      
      case 'detail':
        return `Here's the nitty gritty: ${snippet}. I looked at the website content, the URL structure, domain patterns - all that stuff. That's what led me to this conclusion.`;
      
      default:
        if (label === 'Unknown') {
          return `So this site is marked as "Unknown" because ${snippet}. I just couldn't figure out if it's safe or not, you know?`;
        }
        return `I marked this as "${label}" because ${snippet}. That's what I found when I checked it out.`;
    }
  }
  
  function getReassurance(emotion, context) {
    if (emotion === 'worried') {
      return "Don't worry though - I'm here to keep you safe, but you can always choose to visit the site if you think I'm wrong.";
    }
    if (emotion === 'confused') {
      return "Feel free to ask me anything else if you're still confused about this.";
    }
    if (emotion === 'skeptical') {
      return "I try to be cautious to keep you safe, but I'm not perfect. Your feedback helps me get better at this.";
    }
    return "";
  }
  
  function getSuggestion(intent, label, context) {
    if (intent === 'suggestion') {
      return "If you're looking for safe alternatives, try official websites, verified news sources, or trusted educational sites instead.";
    }
    if (intent === 'action') {
      return "You can totally report this if you think I got it wrong - just use the report function in the extension.";
    }
    if (context.recentTopics.includes('safety') && label === 'Wrong') {
      return "If you need similar content but safely, maybe look for official or verified sources instead?";
    }
    return "";
  }
  
  function getClosing(emotion, context) {
    if (emotion === 'grateful') {
      return "Anything else you want to know about this site or how I work?";
    }
    if (context.isFollowUp) {
      return "Does that make more sense now?";
    }
    if (emotion === 'curious') {
      return "What else are you curious about with this classification?";
    }
    return "";
  }
  
  function generateAIResponse(question, url, label, snippet) {
    // Fallback to the intelligent system
    return generateDynamicAIResponse(question, url, label, snippet, []);
  }
}

// Function to request OTP access for blocked sites
function requestOTPAccess(url, reason) {
  console.log('🚀 requestOTPAccess function called with:', { url, reason });
  
  // Create OTP request overlay
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.7);
    z-index: 10002;
    display: flex;
    justify-content: center;
    align-items: center;
  `;
  
  const modal = document.createElement('div');
  modal.style.cssText = `
    background: white;
    padding: 30px;
    border-radius: 12px;
    max-width: 500px;
    text-align: center;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
  `;
  
  modal.innerHTML = `
    <div style="font-size: 48px; margin-bottom: 20px;">🔐</div>
    <h2 style="color: #4caf50; margin-bottom: 15px;">Request OTP Access</h2>
    <p style="margin-bottom: 20px; color: #666;">
      To access this blocked site, you need approval from your volunteer.
    </p>
    <p style="margin-bottom: 25px; font-size: 14px; color: #888;">
      <strong>Site:</strong> ${url}<br>
      <strong>Reason:</strong> ${reason}
    </p>
    <div id="otp-status" style="margin-bottom: 20px;"></div>
    <div id="otp-input-section" style="display: none;">
      <input type="text" id="otp-input" placeholder="Enter 6-digit OTP" maxlength="6" style="
        padding: 12px;
        border: 1px solid #ddd;
        border-radius: 6px;
        font-size: 16px;
        text-align: center;
        letter-spacing: 2px;
        margin-bottom: 15px;
        width: 200px;
      ">
      <br>
      <button id="verify-otp-btn" style="
        background: #4caf50;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
        margin-right: 10px;
      ">Verify OTP</button>
    </div>
    <div style="display: flex; gap: 10px; justify-content: center; margin-top: 20px;">
      <button id="request-otp-btn" style="
        background: #4caf50;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
      ">📱 Request OTP</button>
      <button id="close-otp-modal-btn" style="
        background: #666;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
      ">Close</button>
    </div>
  `;
  
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  
  let currentRequestId = null;
  
  // Event handlers
  document.getElementById('request-otp-btn').addEventListener('click', async () => {
    const statusDiv = document.getElementById('otp-status');
    const inputSection = document.getElementById('otp-input-section');
    const requestBtn = document.getElementById('request-otp-btn');
    
    console.log('🔐 OTP Request button clicked for:', url, 'Reason:', reason);
    
    statusDiv.innerHTML = '<p style="color: #2196f3;">📤 Sending OTP request to volunteers...</p>';
    requestBtn.disabled = true;
    requestBtn.textContent = 'Sending...';
    
    try {
      console.log('📤 Sending OTP request message to background script...');
      console.log('📤 Message payload:', { type: 'requestOTP', url: url, reason: reason });
      
          // First test if background script is responding
          console.log('🧪 Testing background script communication...');
          const testResponse = await chrome.runtime.sendMessage({ type: 'test' });
          console.log('🧪 Test response:', testResponse);
          
          // Check volunteer count
          console.log('👥 Checking volunteer count...');
          const volunteerResponse = await chrome.runtime.sendMessage({ type: 'getVolunteerCount' });
          console.log('👥 Volunteer response:', volunteerResponse);
      
      if (!testResponse) {
        console.error('❌ Background script is not responding to test message');
        statusDiv.innerHTML = '<p style="color: #d32f2f;">❌ Background script not loaded. Please reload the extension.</p>';
        requestBtn.disabled = false;
        requestBtn.textContent = '📱 Request OTP';
        return;
      }
      
      console.log('📤 About to send OTP request message...');
      const response = await chrome.runtime.sendMessage({
        type: 'requestOTP',
        url: url,
        reason: reason
      });
      console.log('📤 OTP request message sent, waiting for response...');
      
      console.log('📥 OTP request response received:', response);
      console.log('📥 Response type:', typeof response);
      console.log('📥 Response success:', response?.success);
      
      // Check if we got a response at all
      if (response === undefined) {
        console.error('❌ No response from background script - this indicates a communication issue');
        statusDiv.innerHTML = '<p style="color: #d32f2f;">❌ Background script not responding. Please reload the extension.</p>';
        requestBtn.disabled = false;
        requestBtn.textContent = '📱 Request OTP';
        return;
      }
      
      if (response && response.success) {
        currentRequestId = response.requestId;
        statusDiv.innerHTML = `<p style="color: #4caf50;">✅ ${response.message}</p>`;
        inputSection.style.display = 'block';
        requestBtn.style.display = 'none';
      } else if (response && response.requiresSetup) {
        statusDiv.innerHTML = `<p style="color: #f57c00;">⚠️ ${response.error}</p>`;
        requestBtn.disabled = false;
        requestBtn.textContent = '📱 Request OTP';
      } else if (response && response.limitReached) {
        statusDiv.innerHTML = `<p style="color: #d32f2f;">🚫 ${response.error}</p>`;
        requestBtn.disabled = false;
        requestBtn.textContent = '📱 Request OTP';
      } else if (response && response.error) {
        statusDiv.innerHTML = `<p style="color: #d32f2f;">❌ ${response.error}</p>`;
        requestBtn.disabled = false;
        requestBtn.textContent = '📱 Request OTP';
      } else {
        statusDiv.innerHTML = `<p style="color: #d32f2f;">❌ No response from background script. Please try again.</p>`;
        requestBtn.disabled = false;
        requestBtn.textContent = '📱 Request OTP';
      }
    } catch (error) {
      console.error('❌ Error requesting OTP:', error);
      console.error('❌ Error details:', error.message, error.stack);
      statusDiv.innerHTML = `<p style="color: #d32f2f;">❌ Error requesting OTP: ${error.message}</p>`;
      requestBtn.disabled = false;
      requestBtn.textContent = '📱 Request OTP';
    }
  });
  
  document.getElementById('verify-otp-btn').addEventListener('click', async () => {
    const otpInput = document.getElementById('otp-input');
    const otp = otpInput.value.trim();
    const statusDiv = document.getElementById('otp-status');
    const verifyBtn = document.getElementById('verify-otp-btn');
    
    if (!otp || otp.length !== 6) {
      statusDiv.innerHTML = '<p style="color: #d32f2f;">❌ Please enter a valid 6-digit OTP</p>';
      return;
    }
    
    verifyBtn.disabled = true;
    verifyBtn.textContent = 'Verifying...';
    statusDiv.innerHTML = '<p style="color: #2196f3;">🔍 Verifying OTP...</p>';
    
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'verifyOTP',
        otp: otp,
        requestId: currentRequestId
      });
      
      if (response.success) {
        statusDiv.innerHTML = '<p style="color: #4caf50;">✅ Access granted! Opening website...</p>';
        setTimeout(() => {
          document.body.removeChild(overlay);
          window.open(url, '_blank');
        }, 1500);
      } else {
        statusDiv.innerHTML = `<p style="color: #d32f2f;">❌ ${response.error}</p>`;
        verifyBtn.disabled = false;
        verifyBtn.textContent = 'Verify OTP';
        otpInput.value = '';
      }
    } catch (error) {
      console.error('Error verifying OTP:', error);
      statusDiv.innerHTML = '<p style="color: #d32f2f;">❌ Error verifying OTP. Please try again.</p>';
      verifyBtn.disabled = false;
      verifyBtn.textContent = 'Verify OTP';
    }
  });
  
  document.getElementById('close-otp-modal-btn').addEventListener('click', () => {
    document.body.removeChild(overlay);
  });
  
  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      document.body.removeChild(overlay);
    }
  });
  
  // Auto-focus OTP input when it appears
  document.getElementById('otp-input').addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, ''); // Only allow digits
  });
}
