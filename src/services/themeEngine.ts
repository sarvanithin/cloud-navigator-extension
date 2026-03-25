/**
 * Theme Engine Service
 * Provides adaptive theming that matches cloud provider design languages
 * with smooth transitions and custom user preferences
 */

import { CloudProvider } from '../types';

export interface ThemeColors {
  primary: string;
  primaryDark: string;
  primaryLight: string;
  secondary: string;
  secondaryDark: string;
  secondaryLight: string;
  accent: string;
  background: string;
  backgroundAlt: string;
  surface: string;
  surfaceHover: string;
  text: string;
  textSecondary: string;
  textDisabled: string;
  border: string;
  borderLight: string;
  success: string;
  warning: string;
  error: string;
  info: string;
}

export interface ThemeTypography {
  fontFamily: string;
  fontFamilyCode: string;
  fontSize: {
    xs: string;
    sm: string;
    base: string;
    lg: string;
    xl: string;
    '2xl': string;
    '3xl': string;
  };
  fontWeight: {
    light: number;
    normal: number;
    medium: number;
    semibold: number;
    bold: number;
  };
  lineHeight: {
    tight: number;
    normal: number;
    relaxed: number;
  };
}

export interface ThemeSpacing {
  unit: number;
  xs: string;
  sm: string;
  md: string;
  lg: string;
  xl: string;
  '2xl': string;
  '3xl': string;
}

export interface ThemeShadows {
  none: string;
  sm: string;
  md: string;
  lg: string;
  xl: string;
  '2xl': string;
  inner: string;
  colored: string;
}

export interface ThemeAnimations {
  duration: {
    instant: string;
    fast: string;
    normal: string;
    slow: string;
  };
  easing: {
    linear: string;
    easeIn: string;
    easeOut: string;
    easeInOut: string;
    bounce: string;
  };
}

export interface Theme {
  id: string;
  name: string;
  provider: CloudProvider;
  mode: 'light' | 'dark';
  colors: ThemeColors;
  typography: ThemeTypography;
  spacing: ThemeSpacing;
  shadows: ThemeShadows;
  animations: ThemeAnimations;
  borderRadius: {
    none: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
    full: string;
  };
  customCSS?: string;
}

export class ThemeEngine {
  private currentTheme: Theme | null = null;
  private userPreferences: Partial<Theme> = {};
  private themeElement: HTMLStyleElement | null = null;
  private transitionElement: HTMLStyleElement | null = null;
  private observers: Set<(theme: Theme) => void> = new Set();
  private autoDetect: boolean = true;
  private transitionDuration: number = 300;

  // Predefined themes for each cloud provider
  private themes: Record<string, Theme> = {
    'aws-light': {
      id: 'aws-light',
      name: 'AWS Light',
      provider: 'aws' as CloudProvider,
      mode: 'light',
      colors: {
        primary: '#FF9900',
        primaryDark: '#EC7211',
        primaryLight: '#FFB84D',
        secondary: '#232F3E',
        secondaryDark: '#161E2E',
        secondaryLight: '#37475A',
        accent: '#146EB4',
        background: '#FFFFFF',
        backgroundAlt: '#FAFAFA',
        surface: '#FFFFFF',
        surfaceHover: '#F5F5F5',
        text: '#232F3E',
        textSecondary: '#545B64',
        textDisabled: '#AAB7B8',
        border: '#D5DBDB',
        borderLight: '#EAF0F0',
        success: '#1E8900',
        warning: '#FF9900',
        error: '#D13212',
        info: '#0073BB'
      },
      typography: {
        fontFamily: '"Amazon Ember", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontFamilyCode: '"Monaco", "Menlo", "Ubuntu Mono", monospace',
        fontSize: {
          xs: '0.75rem',
          sm: '0.875rem',
          base: '1rem',
          lg: '1.125rem',
          xl: '1.25rem',
          '2xl': '1.5rem',
          '3xl': '2rem'
        },
        fontWeight: {
          light: 300,
          normal: 400,
          medium: 500,
          semibold: 600,
          bold: 700
        },
        lineHeight: {
          tight: 1.25,
          normal: 1.5,
          relaxed: 1.75
        }
      },
      spacing: {
        unit: 4,
        xs: '0.25rem',
        sm: '0.5rem',
        md: '1rem',
        lg: '1.5rem',
        xl: '2rem',
        '2xl': '3rem',
        '3xl': '4rem'
      },
      shadows: {
        none: 'none',
        sm: '0 1px 2px rgba(0, 0, 0, 0.05)',
        md: '0 2px 4px rgba(0, 0, 0, 0.08)',
        lg: '0 4px 8px rgba(0, 0, 0, 0.12)',
        xl: '0 8px 16px rgba(0, 0, 0, 0.16)',
        '2xl': '0 12px 24px rgba(0, 0, 0, 0.20)',
        inner: 'inset 0 2px 4px rgba(0, 0, 0, 0.06)',
        colored: '0 4px 8px rgba(255, 153, 0, 0.25)'
      },
      animations: {
        duration: {
          instant: '0ms',
          fast: '150ms',
          normal: '300ms',
          slow: '500ms'
        },
        easing: {
          linear: 'linear',
          easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
          easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
          easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
          bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)'
        }
      },
      borderRadius: {
        none: '0',
        sm: '2px',
        md: '4px',
        lg: '8px',
        xl: '12px',
        full: '9999px'
      }
    },

    'gcp-light': {
      id: 'gcp-light',
      name: 'Google Cloud Light',
      provider: 'gcp' as CloudProvider,
      mode: 'light',
      colors: {
        primary: '#1A73E8',
        primaryDark: '#1557B0',
        primaryLight: '#4285F4',
        secondary: '#34A853',
        secondaryDark: '#2E7D32',
        secondaryLight: '#66BB6A',
        accent: '#FBBC04',
        background: '#FFFFFF',
        backgroundAlt: '#F8F9FA',
        surface: '#FFFFFF',
        surfaceHover: '#F1F3F4',
        text: '#202124',
        textSecondary: '#5F6368',
        textDisabled: '#9AA0A6',
        border: '#DADCE0',
        borderLight: '#E8EAED',
        success: '#34A853',
        warning: '#FBBC04',
        error: '#EA4335',
        info: '#1A73E8'
      },
      typography: {
        fontFamily: '"Google Sans", "Roboto", -apple-system, BlinkMacSystemFont, sans-serif',
        fontFamilyCode: '"Roboto Mono", "Monaco", monospace',
        fontSize: {
          xs: '0.75rem',
          sm: '0.875rem',
          base: '1rem',
          lg: '1.125rem',
          xl: '1.25rem',
          '2xl': '1.5rem',
          '3xl': '2.125rem'
        },
        fontWeight: {
          light: 300,
          normal: 400,
          medium: 500,
          semibold: 600,
          bold: 700
        },
        lineHeight: {
          tight: 1.25,
          normal: 1.5,
          relaxed: 1.75
        }
      },
      spacing: {
        unit: 4,
        xs: '0.25rem',
        sm: '0.5rem',
        md: '1rem',
        lg: '1.5rem',
        xl: '2rem',
        '2xl': '3rem',
        '3xl': '4rem'
      },
      shadows: {
        none: 'none',
        sm: '0 1px 2px 0 rgba(60, 64, 67, 0.3), 0 1px 3px 1px rgba(60, 64, 67, 0.15)',
        md: '0 1px 3px 0 rgba(60, 64, 67, 0.3), 0 4px 8px 3px rgba(60, 64, 67, 0.15)',
        lg: '0 2px 6px 2px rgba(60, 64, 67, 0.15)',
        xl: '0 4px 8px 3px rgba(60, 64, 67, 0.15)',
        '2xl': '0 8px 16px 6px rgba(60, 64, 67, 0.15)',
        inner: 'inset 0 2px 4px rgba(60, 64, 67, 0.06)',
        colored: '0 4px 8px rgba(26, 115, 232, 0.25)'
      },
      animations: {
        duration: {
          instant: '0ms',
          fast: '200ms',
          normal: '300ms',
          slow: '400ms'
        },
        easing: {
          linear: 'linear',
          easeIn: 'cubic-bezier(0.4, 0.0, 1, 1)',
          easeOut: 'cubic-bezier(0.0, 0.0, 0.2, 1)',
          easeInOut: 'cubic-bezier(0.4, 0.0, 0.2, 1)',
          bounce: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
        }
      },
      borderRadius: {
        none: '0',
        sm: '4px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        full: '9999px'
      }
    },

    'azure-light': {
      id: 'azure-light',
      name: 'Azure Light',
      provider: 'azure' as CloudProvider,
      mode: 'light',
      colors: {
        primary: '#0078D4',
        primaryDark: '#005A9E',
        primaryLight: '#40A9FF',
        secondary: '#00BCF2',
        secondaryDark: '#0090BA',
        secondaryLight: '#5ED0FA',
        accent: '#FFB900',
        background: '#FFFFFF',
        backgroundAlt: '#F3F2F1',
        surface: '#FFFFFF',
        surfaceHover: '#F5F5F5',
        text: '#323130',
        textSecondary: '#605E5C',
        textDisabled: '#A19F9D',
        border: '#E1DFDD',
        borderLight: '#EDEBE9',
        success: '#107C10',
        warning: '#FFB900',
        error: '#D83B01',
        info: '#0078D4'
      },
      typography: {
        fontFamily: '"Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, sans-serif',
        fontFamilyCode: '"Cascadia Code", "Consolas", monospace',
        fontSize: {
          xs: '0.75rem',
          sm: '0.875rem',
          base: '0.9375rem',
          lg: '1.0625rem',
          xl: '1.25rem',
          '2xl': '1.5rem',
          '3xl': '2rem'
        },
        fontWeight: {
          light: 300,
          normal: 400,
          medium: 500,
          semibold: 600,
          bold: 700
        },
        lineHeight: {
          tight: 1.3,
          normal: 1.5,
          relaxed: 1.7
        }
      },
      spacing: {
        unit: 4,
        xs: '0.25rem',
        sm: '0.5rem',
        md: '1rem',
        lg: '1.5rem',
        xl: '2rem',
        '2xl': '3rem',
        '3xl': '4rem'
      },
      shadows: {
        none: 'none',
        sm: '0 1px 2px rgba(0, 0, 0, 0.04)',
        md: '0 2px 4px rgba(0, 0, 0, 0.08)',
        lg: '0 4px 8px rgba(0, 0, 0, 0.12)',
        xl: '0 8px 16px rgba(0, 0, 0, 0.16)',
        '2xl': '0 12px 24px rgba(0, 0, 0, 0.20)',
        inner: 'inset 0 2px 4px rgba(0, 0, 0, 0.06)',
        colored: '0 4px 8px rgba(0, 120, 212, 0.25)'
      },
      animations: {
        duration: {
          instant: '0ms',
          fast: '100ms',
          normal: '200ms',
          slow: '300ms'
        },
        easing: {
          linear: 'linear',
          easeIn: 'cubic-bezier(0.1, 0.9, 0.2, 1)',
          easeOut: 'cubic-bezier(0.1, 0.25, 0.75, 0.9)',
          easeInOut: 'cubic-bezier(0.1, 0.25, 0.1, 1)',
          bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)'
        }
      },
      borderRadius: {
        none: '0',
        sm: '2px',
        md: '4px',
        lg: '6px',
        xl: '8px',
        full: '9999px'
      }
    },

    // Add dark themes
    'aws-dark': {
      id: 'aws-dark',
      name: 'AWS Dark',
      provider: 'aws' as CloudProvider,
      mode: 'dark',
      colors: {
        primary: '#FF9900',
        primaryDark: '#CC7A00',
        primaryLight: '#FFB84D',
        secondary: '#37475A',
        secondaryDark: '#232F3E',
        secondaryLight: '#545B64',
        accent: '#4B9FDE',
        background: '#0F1B2A',
        backgroundAlt: '#161E2E',
        surface: '#1C2838',
        surfaceHover: '#232F3E',
        text: '#FFFFFF',
        textSecondary: '#B6BCC5',
        textDisabled: '#6B7280',
        border: '#37475A',
        borderLight: '#2A3441',
        success: '#4ADE80',
        warning: '#FBBF24',
        error: '#F87171',
        info: '#60A5FA'
      },
      typography: {
        fontFamily: '"Amazon Ember", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontFamilyCode: '"Monaco", "Menlo", "Ubuntu Mono", monospace',
        fontSize: {
          xs: '0.75rem',
          sm: '0.875rem',
          base: '1rem',
          lg: '1.125rem',
          xl: '1.25rem',
          '2xl': '1.5rem',
          '3xl': '2rem'
        },
        fontWeight: {
          light: 300,
          normal: 400,
          medium: 500,
          semibold: 600,
          bold: 700
        },
        lineHeight: {
          tight: 1.25,
          normal: 1.5,
          relaxed: 1.75
        }
      },
      spacing: {
        unit: 4,
        xs: '0.25rem',
        sm: '0.5rem',
        md: '1rem',
        lg: '1.5rem',
        xl: '2rem',
        '2xl': '3rem',
        '3xl': '4rem'
      },
      shadows: {
        none: 'none',
        sm: '0 1px 2px rgba(0, 0, 0, 0.25)',
        md: '0 2px 4px rgba(0, 0, 0, 0.35)',
        lg: '0 4px 8px rgba(0, 0, 0, 0.45)',
        xl: '0 8px 16px rgba(0, 0, 0, 0.55)',
        '2xl': '0 12px 24px rgba(0, 0, 0, 0.65)',
        inner: 'inset 0 2px 4px rgba(0, 0, 0, 0.25)',
        colored: '0 4px 8px rgba(255, 153, 0, 0.35)'
      },
      animations: {
        duration: {
          instant: '0ms',
          fast: '150ms',
          normal: '300ms',
          slow: '500ms'
        },
        easing: {
          linear: 'linear',
          easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
          easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
          easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
          bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)'
        }
      },
      borderRadius: {
        none: '0',
        sm: '2px',
        md: '4px',
        lg: '8px',
        xl: '12px',
        full: '9999px'
      }
    },

    // Default theme
    'default-light': {
      id: 'default-light',
      name: 'Cloud Navigator',
      provider: 'generic' as CloudProvider,
      mode: 'light',
      colors: {
        primary: '#8B5CF6',
        primaryDark: '#7C3AED',
        primaryLight: '#A78BFA',
        secondary: '#14B8A6',
        secondaryDark: '#0D9488',
        secondaryLight: '#2DD4BF',
        accent: '#F97316',
        background: '#FFFFFF',
        backgroundAlt: '#F9FAFB',
        surface: '#FFFFFF',
        surfaceHover: '#F3F4F6',
        text: '#111827',
        textSecondary: '#6B7280',
        textDisabled: '#9CA3AF',
        border: '#E5E7EB',
        borderLight: '#F3F4F6',
        success: '#10B981',
        warning: '#F59E0B',
        error: '#EF4444',
        info: '#3B82F6'
      },
      typography: {
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontFamilyCode: '"JetBrains Mono", "Fira Code", monospace',
        fontSize: {
          xs: '0.75rem',
          sm: '0.875rem',
          base: '1rem',
          lg: '1.125rem',
          xl: '1.25rem',
          '2xl': '1.5rem',
          '3xl': '2rem'
        },
        fontWeight: {
          light: 300,
          normal: 400,
          medium: 500,
          semibold: 600,
          bold: 700
        },
        lineHeight: {
          tight: 1.25,
          normal: 1.5,
          relaxed: 1.75
        }
      },
      spacing: {
        unit: 4,
        xs: '0.25rem',
        sm: '0.5rem',
        md: '1rem',
        lg: '1.5rem',
        xl: '2rem',
        '2xl': '3rem',
        '3xl': '4rem'
      },
      shadows: {
        none: 'none',
        sm: '0 1px 2px rgba(0, 0, 0, 0.05)',
        md: '0 4px 6px rgba(0, 0, 0, 0.07)',
        lg: '0 10px 15px rgba(0, 0, 0, 0.1)',
        xl: '0 20px 25px rgba(0, 0, 0, 0.1)',
        '2xl': '0 25px 50px rgba(0, 0, 0, 0.12)',
        inner: 'inset 0 2px 4px rgba(0, 0, 0, 0.06)',
        colored: '0 10px 15px rgba(139, 92, 246, 0.2)'
      },
      animations: {
        duration: {
          instant: '0ms',
          fast: '150ms',
          normal: '300ms',
          slow: '500ms'
        },
        easing: {
          linear: 'linear',
          easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
          easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
          easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
          bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)'
        }
      },
      borderRadius: {
        none: '0',
        sm: '0.25rem',
        md: '0.375rem',
        lg: '0.5rem',
        xl: '0.75rem',
        full: '9999px'
      }
    }
  };

  constructor() {
    this.initializeTheme();
    this.setupAutoDetection();
  }

  /**
   * Initialize theme on load
   */
  private initializeTheme(): void {
    // Create style element for theme
    this.themeElement = document.createElement('style');
    this.themeElement.id = 'cloud-navigator-theme';
    document.head.appendChild(this.themeElement);

    // Create style element for transitions
    this.transitionElement = document.createElement('style');
    this.transitionElement.id = 'cloud-navigator-transitions';
    document.head.appendChild(this.transitionElement);

    // Load saved theme or use default
    this.loadSavedTheme();
  }

  /**
   * Setup auto-detection of cloud provider
   */
  private setupAutoDetection(): void {
    if (!this.autoDetect) return;

    // Check URL periodically for cloud provider
    setInterval(() => {
      const detectedProvider = this.detectCloudProvider();
      if (detectedProvider && detectedProvider !== this.currentTheme?.provider) {
        this.applyThemeForProvider(detectedProvider);
      }
    }, 2000);

    // Initial detection
    const detectedProvider = this.detectCloudProvider();
    if (detectedProvider) {
      this.applyThemeForProvider(detectedProvider);
    }
  }

  /**
   * Detect cloud provider from URL
   */
  private detectCloudProvider(): CloudProvider | null {
    const url = window.location.href;
    const patterns: Record<CloudProvider, RegExp> = {
      aws: /console\.aws\.amazon\.com/i,
      gcp: /console\.cloud\.google\.com/i,
      azure: /portal\.azure\.com/i,
      firebase: /console\.firebase\.google\.com/i,
      heroku: /dashboard\.heroku\.com/i,
      digitalocean: /cloud\.digitalocean\.com/i,
      vercel: /vercel\.com\/dashboard/i,
      netlify: /app\.netlify\.com/i,
      generic: /.*/
    } as any;

    for (const [provider, pattern] of Object.entries(patterns)) {
      if (pattern.test(url)) {
        return provider as CloudProvider;
      }
    }

    return null;
  }

  /**
   * Apply theme for specific provider
   */
  public applyThemeForProvider(provider: CloudProvider): void {
    const isDarkMode = this.detectDarkMode();
    const themeId = `${provider}-${isDarkMode ? 'dark' : 'light'}`;
    const theme = this.themes[themeId] || this.themes['default-light'];

    this.applyTheme(theme);
  }

  /**
   * Detect if user prefers dark mode
   */
  private detectDarkMode(): boolean {
    // Check user preference
    const savedMode = localStorage.getItem('cloud-navigator-theme-mode');
    if (savedMode) {
      return savedMode === 'dark';
    }

    // Check system preference
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  /**
   * Apply theme with transitions
   */
  public applyTheme(theme: Theme): void {
    if (this.currentTheme?.id === theme.id) return;

    // Add transition styles
    this.addTransitionStyles();

    // Apply theme after a frame to ensure transitions work
    requestAnimationFrame(() => {
      this.currentTheme = { ...theme, ...this.userPreferences };
      this.generateAndApplyCSS();
      this.saveTheme();
      this.notifyObservers();

      // Remove transitions after animation
      setTimeout(() => {
        this.removeTransitionStyles();
      }, this.transitionDuration);
    });
  }

  /**
   * Generate CSS from theme
   */
  private generateAndApplyCSS(): void {
    if (!this.currentTheme || !this.themeElement) return;

    const theme = this.currentTheme;
    const css = `
      :root {
        /* Colors */
        --cn-color-primary: ${theme.colors.primary};
        --cn-color-primary-dark: ${theme.colors.primaryDark};
        --cn-color-primary-light: ${theme.colors.primaryLight};
        --cn-color-secondary: ${theme.colors.secondary};
        --cn-color-secondary-dark: ${theme.colors.secondaryDark};
        --cn-color-secondary-light: ${theme.colors.secondaryLight};
        --cn-color-accent: ${theme.colors.accent};
        --cn-color-background: ${theme.colors.background};
        --cn-color-background-alt: ${theme.colors.backgroundAlt};
        --cn-color-surface: ${theme.colors.surface};
        --cn-color-surface-hover: ${theme.colors.surfaceHover};
        --cn-color-text: ${theme.colors.text};
        --cn-color-text-secondary: ${theme.colors.textSecondary};
        --cn-color-text-disabled: ${theme.colors.textDisabled};
        --cn-color-border: ${theme.colors.border};
        --cn-color-border-light: ${theme.colors.borderLight};
        --cn-color-success: ${theme.colors.success};
        --cn-color-warning: ${theme.colors.warning};
        --cn-color-error: ${theme.colors.error};
        --cn-color-info: ${theme.colors.info};

        /* Typography */
        --cn-font-family: ${theme.typography.fontFamily};
        --cn-font-family-code: ${theme.typography.fontFamilyCode};
        --cn-font-size-xs: ${theme.typography.fontSize.xs};
        --cn-font-size-sm: ${theme.typography.fontSize.sm};
        --cn-font-size-base: ${theme.typography.fontSize.base};
        --cn-font-size-lg: ${theme.typography.fontSize.lg};
        --cn-font-size-xl: ${theme.typography.fontSize.xl};
        --cn-font-size-2xl: ${theme.typography.fontSize['2xl']};
        --cn-font-size-3xl: ${theme.typography.fontSize['3xl']};
        --cn-font-weight-light: ${theme.typography.fontWeight.light};
        --cn-font-weight-normal: ${theme.typography.fontWeight.normal};
        --cn-font-weight-medium: ${theme.typography.fontWeight.medium};
        --cn-font-weight-semibold: ${theme.typography.fontWeight.semibold};
        --cn-font-weight-bold: ${theme.typography.fontWeight.bold};
        --cn-line-height-tight: ${theme.typography.lineHeight.tight};
        --cn-line-height-normal: ${theme.typography.lineHeight.normal};
        --cn-line-height-relaxed: ${theme.typography.lineHeight.relaxed};

        /* Spacing */
        --cn-spacing-unit: ${theme.spacing.unit}px;
        --cn-spacing-xs: ${theme.spacing.xs};
        --cn-spacing-sm: ${theme.spacing.sm};
        --cn-spacing-md: ${theme.spacing.md};
        --cn-spacing-lg: ${theme.spacing.lg};
        --cn-spacing-xl: ${theme.spacing.xl};
        --cn-spacing-2xl: ${theme.spacing['2xl']};
        --cn-spacing-3xl: ${theme.spacing['3xl']};

        /* Shadows */
        --cn-shadow-none: ${theme.shadows.none};
        --cn-shadow-sm: ${theme.shadows.sm};
        --cn-shadow-md: ${theme.shadows.md};
        --cn-shadow-lg: ${theme.shadows.lg};
        --cn-shadow-xl: ${theme.shadows.xl};
        --cn-shadow-2xl: ${theme.shadows['2xl']};
        --cn-shadow-inner: ${theme.shadows.inner};
        --cn-shadow-colored: ${theme.shadows.colored};

        /* Border Radius */
        --cn-radius-none: ${theme.borderRadius.none};
        --cn-radius-sm: ${theme.borderRadius.sm};
        --cn-radius-md: ${theme.borderRadius.md};
        --cn-radius-lg: ${theme.borderRadius.lg};
        --cn-radius-xl: ${theme.borderRadius.xl};
        --cn-radius-full: ${theme.borderRadius.full};

        /* Animations */
        --cn-duration-instant: ${theme.animations.duration.instant};
        --cn-duration-fast: ${theme.animations.duration.fast};
        --cn-duration-normal: ${theme.animations.duration.normal};
        --cn-duration-slow: ${theme.animations.duration.slow};
        --cn-easing-linear: ${theme.animations.easing.linear};
        --cn-easing-in: ${theme.animations.easing.easeIn};
        --cn-easing-out: ${theme.animations.easing.easeOut};
        --cn-easing-in-out: ${theme.animations.easing.easeInOut};
        --cn-easing-bounce: ${theme.animations.easing.bounce};
      }

      /* Apply theme to extension elements */
      .cloud-navigator-root {
        font-family: var(--cn-font-family);
        color: var(--cn-color-text);
        background-color: var(--cn-color-background);
      }

      .cn-button-primary {
        background: linear-gradient(135deg, var(--cn-color-primary), var(--cn-color-primary-dark));
        color: white;
        border-radius: var(--cn-radius-md);
        padding: var(--cn-spacing-sm) var(--cn-spacing-md);
        font-weight: var(--cn-font-weight-medium);
        box-shadow: var(--cn-shadow-md);
        transition: all var(--cn-duration-fast) var(--cn-easing-in-out);
      }

      .cn-button-primary:hover {
        transform: translateY(-1px);
        box-shadow: var(--cn-shadow-lg);
      }

      .cn-card {
        background: var(--cn-color-surface);
        border: 1px solid var(--cn-color-border);
        border-radius: var(--cn-radius-lg);
        padding: var(--cn-spacing-lg);
        box-shadow: var(--cn-shadow-sm);
      }

      .cn-input {
        background: var(--cn-color-surface);
        border: 1px solid var(--cn-color-border);
        border-radius: var(--cn-radius-md);
        padding: var(--cn-spacing-sm);
        font-size: var(--cn-font-size-base);
        color: var(--cn-color-text);
        transition: border-color var(--cn-duration-fast) var(--cn-easing-in-out);
      }

      .cn-input:focus {
        outline: none;
        border-color: var(--cn-color-primary);
        box-shadow: 0 0 0 3px rgba(var(--cn-color-primary), 0.1);
      }

      ${theme.customCSS || ''}
    `;

    this.themeElement.textContent = css;
  }

  /**
   * Add transition styles for smooth theme change
   */
  private addTransitionStyles(): void {
    if (!this.transitionElement) return;

    const transitionCSS = `
      * {
        transition:
          background-color ${this.transitionDuration}ms ease-in-out,
          border-color ${this.transitionDuration}ms ease-in-out,
          color ${this.transitionDuration}ms ease-in-out,
          box-shadow ${this.transitionDuration}ms ease-in-out !important;
      }
    `;

    this.transitionElement.textContent = transitionCSS;
  }

  /**
   * Remove transition styles
   */
  private removeTransitionStyles(): void {
    if (this.transitionElement) {
      this.transitionElement.textContent = '';
    }
  }

  /**
   * Save current theme to storage
   */
  private saveTheme(): void {
    if (!this.currentTheme) return;

    try {
      localStorage.setItem('cloud-navigator-theme', JSON.stringify({
        id: this.currentTheme.id,
        mode: this.currentTheme.mode,
        userPreferences: this.userPreferences
      }));
    } catch (error) {
      console.error('Failed to save theme:', error);
    }
  }

  /**
   * Load saved theme
   */
  private loadSavedTheme(): void {
    try {
      const saved = localStorage.getItem('cloud-navigator-theme');
      if (saved) {
        const { id, userPreferences } = JSON.parse(saved);
        this.userPreferences = userPreferences || {};
        const theme = this.themes[id] || this.themes['default-light'];
        this.applyTheme(theme);
      } else {
        this.applyTheme(this.themes['default-light']);
      }
    } catch (error) {
      console.error('Failed to load theme:', error);
      this.applyTheme(this.themes['default-light']);
    }
  }

  /**
   * Toggle between light and dark mode
   */
  public toggleMode(): void {
    if (!this.currentTheme) return;

    const newMode = this.currentTheme.mode === 'light' ? 'dark' : 'light';
    const provider = this.currentTheme.provider;
    const themeId = `${provider}-${newMode}`;
    const theme = this.themes[themeId] || this.themes[`default-${newMode}`];

    this.applyTheme(theme);
  }

  /**
   * Set custom user preferences
   */
  public setUserPreferences(preferences: Partial<Theme>): void {
    this.userPreferences = { ...this.userPreferences, ...preferences };
    if (this.currentTheme) {
      this.applyTheme(this.currentTheme);
    }
  }

  /**
   * Get current theme
   */
  public getCurrentTheme(): Theme | null {
    return this.currentTheme;
  }

  /**
   * Get all available themes
   */
  public getAvailableThemes(): Theme[] {
    return Object.values(this.themes);
  }

  /**
   * Subscribe to theme changes
   */
  public subscribe(callback: (theme: Theme) => void): () => void {
    this.observers.add(callback);
    return () => this.observers.delete(callback);
  }

  /**
   * Notify observers of theme change
   */
  private notifyObservers(): void {
    if (!this.currentTheme) return;

    this.observers.forEach(callback => {
      try {
        callback(this.currentTheme!);
      } catch (error) {
        console.error('Theme observer error:', error);
      }
    });
  }

  /**
   * Enable/disable auto-detection
   */
  public setAutoDetect(enabled: boolean): void {
    this.autoDetect = enabled;
    if (enabled) {
      this.setupAutoDetection();
    }
  }

  /**
   * Export theme as JSON
   */
  public exportTheme(): string {
    return JSON.stringify(this.currentTheme, null, 2);
  }

  /**
   * Import custom theme
   */
  public importTheme(themeJson: string): void {
    try {
      const theme = JSON.parse(themeJson) as Theme;
      this.themes[theme.id] = theme;
      this.applyTheme(theme);
    } catch (error) {
      console.error('Failed to import theme:', error);
    }
  }

  /**
   * Cleanup and destroy
   */
  public destroy(): void {
    if (this.themeElement) {
      this.themeElement.remove();
      this.themeElement = null;
    }

    if (this.transitionElement) {
      this.transitionElement.remove();
      this.transitionElement = null;
    }

    this.observers.clear();
  }
}

// Export singleton instance
export const themeEngine = new ThemeEngine();