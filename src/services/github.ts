import { Repository, AnalysisResult } from '@/types';

const GITHUB_API_BASE = 'https://api.github.com';

/**
 * GitHubService - Handles GitHub public API access without authentication
 * Uses unauthenticated API calls (60 requests/hour rate limit)
 * All repositories analyzed must be public
 */
export class GitHubService {
  /**
   * Get repository metadata using unauthenticated API
   * Works for public repositories only
   */
  async getRepositoryMetadata(owner: string, repo: string): Promise<Repository> {
    try {
      const response = await fetch(
        `${GITHUB_API_BASE}/repos/${owner}/${repo}`,
        {
          headers: {
            'Accept': 'application/vnd.github.v3+json'
          }
        }
      );

      if (response.status === 404) {
        throw new Error('Repository not found. Make sure it\'s public and the URL is correct.');
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch repository metadata: ${response.statusText}`);
      }

      const repo_data = await response.json();
      return {
        owner: repo_data.owner.login,
        name: repo_data.name,
        url: repo_data.html_url,
        defaultBranch: repo_data.default_branch,
        language: repo_data.language
      };
    } catch (error) {
      console.error('Error fetching repository metadata:', error);
      throw error;
    }
  }

  /**
   * Get repository content using unauthenticated API
   * Works for public repositories only
   */
  async getRepositoryContent(owner: string, repo: string, path: string = ''): Promise<any> {
    try {
      const response = await fetch(
        `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${path}`,
        {
          headers: {
            'Accept': 'application/vnd.github.v3+json'
          }
        }
      );

      if (response.status === 404) {
        throw new Error('Repository or path not found. Make sure it\'s public.');
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch repository content: ${response.statusText}`);
      }

      return response.json();
    } catch (error) {
      console.error('Error fetching repository content:', error);
      throw error;
    }
  }

  /**
   * Get file content using unauthenticated API
   * Works for public repositories only
   */
  async getFileContent(owner: string, repo: string, path: string): Promise<string> {
    try {
      const response = await fetch(
        `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${path}`,
        {
          headers: {
            'Accept': 'application/vnd.github.v3.raw'
          }
        }
      );

      if (response.status === 404) {
        throw new Error(`File not found: ${path}`);
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.statusText}`);
      }

      return response.text();
    } catch (error) {
      console.error('Error fetching file content:', error);
      throw error;
    }
  }

  /**
   * Get repository tree (file listing) using unauthenticated API
   * Useful for discovering repository structure
   */
  async getRepositoryTree(owner: string, repo: string, branch: string = 'main'): Promise<any> {
    try {
      const response = await fetch(
        `${GITHUB_API_BASE}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
        {
          headers: {
            'Accept': 'application/vnd.github.v3+json'
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch repository tree: ${response.statusText}`);
      }

      return response.json();
    } catch (error) {
      console.error('Error fetching repository tree:', error);
      throw error;
    }
  }
}

export const githubService = new GitHubService();
