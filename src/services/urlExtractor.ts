/**
 * URL Extractor Service
 * Handles GitHub URL detection, extraction, and validation
 */

export interface ExtractedRepoInfo {
  owner: string;
  repo: string;
  url: string;
  isValid: boolean;
  error?: string;
}

export class UrlExtractorService {
  /**
   * Parse a GitHub URL and extract owner and repo name
   * Supports formats:
   * - https://github.com/owner/repo
   * - https://github.com/owner/repo/
   * - https://github.com/owner/repo/tree/branch
   * - https://github.com/owner/repo/issues
   * - github.com/owner/repo
   * - owner/repo
   */
  parseGitHubUrl(url: string): ExtractedRepoInfo {
    try {
      // Normalize the input
      const trimmedUrl = url.trim();

      if (!trimmedUrl) {
        return {
          owner: '',
          repo: '',
          url: '',
          isValid: false,
          error: 'URL cannot be empty'
        };
      }

      // Try different URL patterns
      let owner = '';
      let repo = '';

      // Pattern 1: Full URL (https://github.com/owner/repo or variants)
      if (trimmedUrl.includes('github.com')) {
        const urlObj = new URL(trimmedUrl.startsWith('http') ? trimmedUrl : `https://${trimmedUrl}`);
        const pathParts = urlObj.pathname.split('/').filter(p => p);

        if (pathParts.length >= 2) {
          owner = pathParts[0];
          repo = pathParts[1];
        } else {
          return {
            owner: '',
            repo: '',
            url: trimmedUrl,
            isValid: false,
            error: 'Invalid GitHub URL format. Expected: https://github.com/owner/repo'
          };
        }
      } else {
        // Pattern 2: owner/repo format
        const parts = trimmedUrl.split('/').filter(p => p);
        if (parts.length === 2) {
          owner = parts[0];
          repo = parts[1];
        } else {
          return {
            owner: '',
            repo: '',
            url: trimmedUrl,
            isValid: false,
            error: 'Invalid format. Use: https://github.com/owner/repo or owner/repo'
          };
        }
      }

      // Validate owner and repo names
      if (!this.isValidGitHubName(owner)) {
        return {
          owner: '',
          repo: '',
          url: trimmedUrl,
          isValid: false,
          error: `Invalid owner name: "${owner}". GitHub usernames must be alphanumeric with hyphens.`
        };
      }

      if (!this.isValidGitHubName(repo)) {
        return {
          owner: '',
          repo: '',
          url: trimmedUrl,
          isValid: false,
          error: `Invalid repository name: "${repo}". Repository names must be alphanumeric with hyphens and periods.`
        };
      }

      const fullUrl = `https://github.com/${owner}/${repo}`;

      return {
        owner,
        repo,
        url: fullUrl,
        isValid: true
      };
    } catch (error) {
      return {
        owner: '',
        repo: '',
        url: url.trim(),
        isValid: false,
        error: `Failed to parse URL: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Check if a string is a valid GitHub username or repository name
   */
  private isValidGitHubName(name: string): boolean {
    if (!name || name.length === 0) {
      return false;
    }

    // GitHub names must:
    // - Start with alphanumeric
    // - Contain only alphanumeric, hyphens, and underscores
    // - Not end with hyphen
    // - Be 1-39 characters for usernames, 1-255 for repos
    const validPattern = /^[a-zA-Z0-9]([a-zA-Z0-9-_]*[a-zA-Z0-9])?$/;
    return validPattern.test(name);
  }

  /**
   * Extract GitHub URL from the current page context
   * Used when content script detects user is on a GitHub repo page
   */
  async extractFromCurrentPage(): Promise<ExtractedRepoInfo | null> {
    try {
      // This will be called from content script context
      const pathName = window.location.pathname;
      const hostname = window.location.hostname;

      if (!hostname.includes('github.com')) {
        return null;
      }

      const parts = pathName.split('/').filter(p => p);

      if (parts.length < 2) {
        return null;
      }

      const owner = parts[0];
      const repo = parts[1];

      return this.parseGitHubUrl(`${owner}/${repo}`);
    } catch (error) {
      console.error('Error extracting URL from page:', error);
      return null;
    }
  }

  /**
   * Format a repository reference for display
   */
  formatRepoDisplay(owner: string, repo: string): string {
    return `${owner}/${repo}`;
  }

  /**
   * Generate the direct GitHub repository URL
   */
  getRepositoryUrl(owner: string, repo: string): string {
    return `https://github.com/${owner}/${repo}`;
  }

  /**
   * Generate the GitHub raw content URL for a specific file
   */
  getRawFileUrl(owner: string, repo: string, filePath: string, branch: string = 'main'): string {
    return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;
  }

  /**
   * Validate if a URL looks like a public GitHub repository
   */
  isPublicGitHubUrl(url: string): boolean {
    const parsed = this.parseGitHubUrl(url);
    return parsed.isValid;
  }
}

export const urlExtractorService = new UrlExtractorService();
