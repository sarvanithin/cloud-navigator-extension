/**
 * Service Worker / Background Script
 * Handles background tasks and message routing
 * Integrates action tracking and deployment progress
 */

// Store analysis results in chrome.storage
interface StoredAnalysis {
  repository: string;
  analysisDate: string;
  result: any;
}

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender, sendResponse);
  return true; // Keep channel open for async responses
});

async function handleMessage(message: any, sender: chrome.runtime.MessageSender, sendResponse: Function) {
  try {
    switch (message.type) {
      case 'GET_STORED_ANALYSIS':
        const analyses = await chrome.storage.local.get('analyses');
        sendResponse({ success: true, data: analyses.analyses || [] });
        break;

      case 'SAVE_ANALYSIS':
        await saveAnalysis(message.data);
        sendResponse({ success: true });
        break;

      case 'PAGE_CHANGED':
        // Handle page change in content script
        await handlePageChange(message.detection);
        sendResponse({ success: true });
        break;

      case 'GET_GUIDANCE':
        const guidance = getGuidanceForService(message.service);
        sendResponse({ success: true, data: guidance });
        break;

      case 'track_action':
        // Handle action tracking from content scripts
        await trackAction(message.action);
        sendResponse({ success: true });
        break;

      case 'get_action_history':
        // Get action history for current session
        const history = await getActionHistory();
        sendResponse({ success: true, data: history });
        break;

      case 'update_deployment_progress':
        // Update deployment progress
        await updateDeploymentProgress(message.stepId, message.status);
        sendResponse({ success: true });
        break;

      case 'get_deployment_metrics':
        // Get current deployment metrics
        const metrics = await getDeploymentMetrics();
        sendResponse({ success: true, data: metrics });
        break;

      case 'SAVE_ACTIVE_GUIDANCE':
        // Store the active deployment guidance (checklist + step) for content scripts
        await chrome.storage.local.set({ cloudNavigatorActiveGuidance: message.guidance });
        sendResponse({ success: true });
        break;

      case 'GET_ACTIVE_GUIDANCE':
        const guidanceData = await chrome.storage.local.get('cloudNavigatorActiveGuidance');
        sendResponse({ success: true, guidance: guidanceData.cloudNavigatorActiveGuidance || null });
        break;

      case 'ADVANCE_GUIDANCE_STEP': {
        const current = await chrome.storage.local.get('cloudNavigatorActiveGuidance');
        if (current.cloudNavigatorActiveGuidance) {
          current.cloudNavigatorActiveGuidance.currentStepIndex =
            (current.cloudNavigatorActiveGuidance.currentStepIndex || 0) + 1;
          await chrome.storage.local.set({ cloudNavigatorActiveGuidance: current.cloudNavigatorActiveGuidance });
        }
        sendResponse({ success: true, newIndex: current.cloudNavigatorActiveGuidance?.currentStepIndex });
        break;
      }

      case 'CLEAR_ACTIVE_GUIDANCE':
        await chrome.storage.local.remove('cloudNavigatorActiveGuidance');
        sendResponse({ success: true });
        break;

      case 'CLAUDE_PAGE_ANALYSIS': {
        // Ask Claude which element to click for the current step, given visible page content
        try {
          const { apiKey, pageSnapshot, stepTitle, stepInstructions } = message;
          if (!apiKey) { sendResponse({ hint: null }); break; }

          const prompt = `You are helping a developer navigate a cloud console.

Current deployment step: "${stepTitle}"
Instructions for this step:
${stepInstructions.map((i: string, n: number) => `${n + 1}. ${i}`).join('\n')}

The user is currently on this page:
URL: ${pageSnapshot.url}
Page title: ${pageSnapshot.title}
Visible headings: ${pageSnapshot.headings.join(' | ')}
Visible buttons: ${pageSnapshot.buttons.join(' | ')}
Visible links: ${pageSnapshot.links.join(' | ')}

Based on the current step, what is the SINGLE most important element the user should click or interact with right now?
Reply with ONLY the exact button/link text or field label they should click, nothing else. 20 words max.`;

          const resp = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
              'anthropic-dangerous-direct-browser-access': 'true'
            },
            body: JSON.stringify({
              model: 'claude-3-haiku-20240307',
              max_tokens: 60,
              messages: [{ role: 'user', content: prompt }]
            })
          });

          if (resp.ok) {
            const data = await resp.json();
            const hint = data.content?.[0]?.text?.trim() || null;
            sendResponse({ hint });
          } else {
            sendResponse({ hint: null });
          }
        } catch (e) {
          sendResponse({ hint: null });
        }
        break;
      }

      case 'CALL_CLAUDE_API':
        // Handle Claude API call from chatService
        try {
          console.log('[Background] ===== CALL_CLAUDE_API START =====');
          console.log('[Background] API Key present:', !!message.apiKey);
          console.log('[Background] API Key length:', message.apiKey?.length);
          console.log('[Background] API Key prefix:', message.apiKey?.substring(0, 10));
          console.log('[Background] Messages count:', message.messages?.length);
          console.log('[Background] System prompt length:', message.systemPrompt?.length);
          console.log('[Background] Messages:', JSON.stringify(message.messages, null, 2));

          if (!message.apiKey) {
            console.error('[Background] ERROR: No API key provided');
            sendResponse({ error: 'No API key provided to background script' });
            break;
          }

          if (!message.messages || message.messages.length === 0) {
            console.error('[Background] ERROR: No messages provided');
            sendResponse({ error: 'No messages provided to background script' });
            break;
          }

          const result = await callClaudeAPI(
            message.apiKey,
            message.messages,
            message.systemPrompt
          );
          console.log('[Background] ✓ API call successful');
          console.log('[Background] Response length:', result.length);
          console.log('[Background] ===== CALL_CLAUDE_API END =====');
          sendResponse({ result });
        } catch (err) {
          console.error('[Background] ✗ API call error:', err);
          console.error('[Background] Error type:', err?.constructor?.name);
          console.error('[Background] Error message:', err instanceof Error ? err.message : String(err));
          console.error('[Background] Error stack:', err instanceof Error ? err.stack : 'No stack');
          sendResponse({ error: err instanceof Error ? err.message : String(err) });
        }
        break;

      default:
        sendResponse({ error: 'Unknown message type' });
    }
  } catch (error) {
    console.error('Error handling message:', error);
    sendResponse({ success: false, error: String(error) });
  }
}

/**
 * Track user actions
 */
async function trackAction(action: any) {
  try {
    const { cloudNavigatorCurrentSession = { sessionId: '', startTime: Date.now(), actions: [] } } =
      await chrome.storage.local.get('cloudNavigatorCurrentSession');

    // Add timestamp if not present
    if (!action.timestamp) {
      action.timestamp = Date.now();
    }

    // Add to session
    cloudNavigatorCurrentSession.actions.push(action);

    // Save back to storage
    await chrome.storage.local.set({ cloudNavigatorCurrentSession });

    console.log('Action tracked:', action.type);
  } catch (error) {
    console.error('Error tracking action:', error);
  }
}

/**
 * Get action history for current session
 */
async function getActionHistory() {
  try {
    const { cloudNavigatorCurrentSession } = await chrome.storage.local.get('cloudNavigatorCurrentSession');
    return cloudNavigatorCurrentSession || { sessionId: '', startTime: Date.now(), actions: [] };
  } catch (error) {
    console.error('Error getting action history:', error);
    return { sessionId: '', startTime: Date.now(), actions: [] };
  }
}

/**
 * Update deployment progress
 */
async function updateDeploymentProgress(stepId: string, status: string) {
  try {
    const { currentDeploymentSession } = await chrome.storage.local.get('currentDeploymentSession');

    if (currentDeploymentSession && currentDeploymentSession.steps) {
      const step = currentDeploymentSession.steps.find((s: any) => s.id === stepId);
      if (step) {
        step.isCompleted = status === 'completed';
        if (step.isCompleted) {
          step.completedAt = Date.now();
        }

        await chrome.storage.local.set({ currentDeploymentSession });
        console.log(`Step ${stepId} updated to ${status}`);
      }
    }
  } catch (error) {
    console.error('Error updating deployment progress:', error);
  }
}

/**
 * Get deployment metrics
 */
async function getDeploymentMetrics() {
  try {
    const { currentDeploymentSession } = await chrome.storage.local.get('currentDeploymentSession');

    if (!currentDeploymentSession) {
      return null;
    }

    const steps = currentDeploymentSession.steps || [];
    const completedSteps = steps.filter((s: any) => s.isCompleted).length;
    const totalSteps = steps.length;
    const progressPercentage = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;
    const timeSpent = Date.now() - currentDeploymentSession.startTime;

    return {
      totalSteps,
      completedSteps,
      progressPercentage,
      timeSpent,
      estimatedTimeRemaining: Math.max(0, currentDeploymentSession.totalEstimatedTime - timeSpent),
      completionRate: timeSpent > 0 ? completedSteps / (timeSpent / 60000) : 0
    };
  } catch (error) {
    console.error('Error getting deployment metrics:', error);
    return null;
  }
}

async function saveAnalysis(analysis: StoredAnalysis) {
  const { analyses = [] } = await chrome.storage.local.get('analyses');

  // Keep only last 10 analyses
  analyses.unshift(analysis);
  if (analyses.length > 10) {
    analyses.pop();
  }

  await chrome.storage.local.set({ analyses });
}

async function handlePageChange(detection: any) {
  // When user navigates to a cloud service page, get stored analysis
  // and inject relevant guidance
  if (detection && detection.cloudPlatform) {
    const { analyses = [] } = await chrome.storage.local.get('analyses');
    if (analyses.length > 0) {
      const latestAnalysis = analyses[0];
      // Send guidance to content script
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0].id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'INJECT_GUIDANCE',
          service: detection.suggestedService,
          guidance: latestAnalysis.result
        }).catch(() => {
          // Content script might not be available
        });
      }
    }
  }
}

function getGuidanceForService(service: string): any {
  // This would return service-specific guidance
  // For now, returning a basic structure
  return {
    service,
    steps: [],
    documentation: 'https://cloud.google.com/docs'
  };
}

// Handle extension installation/update
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Open welcome page
    chrome.tabs.create({
      url: 'popup.html'
    });
  } else if (details.reason === 'update') {
    console.log('Extension updated');
  }
});

// Handle tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    // Check if it's a cloud service page
    const isCloudServicePage = [
      'console.aws.amazon.com',
      'console.cloud.google.com',
      'portal.azure.com',
      'console.firebase.google.com',
      'dashboard.heroku.com'
    ].some(domain => tab.url?.includes(domain));

    if (isCloudServicePage) {
      // Inject content script if not already injected
      chrome.tabs.sendMessage(tabId, {
        type: 'CHECK_CONTENT_SCRIPT'
      }).catch(() => {
        // Inject if not available
        chrome.scripting.executeScript({
          target: { tabId },
          files: ['content.js']
        });
      });
    }
  }
});

/**
 * Call Claude API from background script
 * This bypasses CORS restrictions that affect content scripts and popups
 */
async function callClaudeAPI(apiKey: string, messages: Array<{ role: string; content: string }>, systemPrompt: string): Promise<string> {
  if (!apiKey) {
    throw new Error('OpenAI API key not configured');
  }

  console.log('[callClaudeAPI] ===== API CALL START =====');
  console.log('[callClaudeAPI] API Key format:', apiKey.substring(0, 10) + '...' + apiKey.substring(apiKey.length - 5));
  console.log('[callClaudeAPI] Message count:', messages.length);
  console.log('[callClaudeAPI] System prompt length:', systemPrompt?.length || 0);

  try {
    const requestBody = {
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages
    };

    console.log('[callClaudeAPI] Request body:', JSON.stringify(requestBody, null, 2));
    console.log('[callClaudeAPI] Sending fetch request to https://api.anthropic.com/v1/messages');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(requestBody)
    });

    console.log('[callClaudeAPI] Response received, status:', response.status);
    console.log('[callClaudeAPI] Response ok:', response.ok);
    console.log('[callClaudeAPI] Response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[callClaudeAPI] Error response data:', errorData);

      // Handle specific error codes
      if (response.status === 401) {
        throw new Error('Claude API error: Invalid or expired API key. Please check your API key in settings.');
      } else if (response.status === 429) {
        throw new Error('Claude API error: Rate limit exceeded. Please try again in a few moments.');
      } else if (response.status >= 500) {
        throw new Error('Claude API error: Service temporarily unavailable. Please try again later.');
      }

      throw new Error(
        `Claude API error: ${response.status} ${response.statusText}. ${
          errorData.error?.message || ''
        }`
      );
    }

    const data = await response.json();
    console.log('[callClaudeAPI] Response data keys:', Object.keys(data));

    if (data.content && data.content[0] && data.content[0].text) {
      console.log('[callClaudeAPI] ✓ Success, response text length:', data.content[0].text.length);
      return data.content[0].text;
    }

    throw new Error('Unexpected Claude API response format: missing content');
  } catch (err) {
    console.error('[callClaudeAPI] ✗ Caught error:', err);
    console.error('[callClaudeAPI] Error type:', err?.constructor?.name);
    console.error('[callClaudeAPI] Error message:', err instanceof Error ? err.message : String(err));

    if (err instanceof TypeError && err.message.includes('Failed to fetch')) {
      console.error('[callClaudeAPI] This is a fetch failure - likely network or CORS issue');
      throw new Error(
        'Network error: Could not reach Claude API. This might be due to: 1) Internet connection issues, 2) Claude API service down, 3) Invalid API key. Please check your connection and API key.'
      );
    }
    // Re-throw our custom errors, wrap others
    if (err instanceof Error && err.message.includes('Claude API error')) {
      throw err;
    }
    throw new Error(`Unexpected error calling Claude API: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Export for testing (if needed)
export { handleMessage, saveAnalysis, handlePageChange, callClaudeAPI };
