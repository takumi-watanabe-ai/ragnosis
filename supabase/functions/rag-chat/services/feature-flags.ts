/**
 * Feature Flag Service - SQL-driven runtime configuration
 * Flags are stored in the database and can be toggled without redeployment
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { LOG_PREFIX } from '../utils/constants.ts'

export interface FeatureFlag {
  enabled: boolean
  config: Record<string, any>
}

export interface FeatureFlags {
  query_planner: FeatureFlag
  query_expansion: FeatureFlag
  answer_verification: FeatureFlag
  cross_encoder_reranking: FeatureFlag
  response_caching: FeatureFlag
}

/**
 * Feature Flag Service with in-memory caching
 */
export class FeatureFlagService {
  private cache: FeatureFlags | null = null
  private lastFetch = 0
  private cacheTTL = 60000 // 60 seconds

  constructor(
    private supabase: SupabaseClient,
    cacheTTL?: number
  ) {
    if (cacheTTL) {
      this.cacheTTL = cacheTTL
    }
  }

  /**
   * Get all feature flags (with caching)
   */
  async getAll(): Promise<FeatureFlags> {
    const now = Date.now()

    // Return cached flags if still fresh
    if (this.cache && now - this.lastFetch < this.cacheTTL) {
      return this.cache
    }

    // Fetch from database
    try {
      const { data, error } = await this.supabase.rpc('get_feature_flags')

      if (error) {
        console.error(`${LOG_PREFIX.ERROR} Failed to fetch feature flags:`, error)
        // Return cached flags or defaults
        return this.cache || this.getDefaults()
      }

      this.cache = data as FeatureFlags
      this.lastFetch = now

      console.log(`${LOG_PREFIX.INFO} Feature flags refreshed from database`)
      return this.cache
    } catch (error) {
      console.error(`${LOG_PREFIX.ERROR} Error fetching feature flags:`, error)
      return this.cache || this.getDefaults()
    }
  }

  /**
   * Get a single feature flag
   */
  async get(flagName: keyof FeatureFlags): Promise<FeatureFlag> {
    const flags = await this.getAll()
    return flags[flagName] || { enabled: false, config: {} }
  }

  /**
   * Check if a feature is enabled
   */
  async isEnabled(flagName: keyof FeatureFlags): Promise<boolean> {
    const flag = await this.get(flagName)
    return flag.enabled
  }

  /**
   * Get feature config
   */
  async getConfig<T = Record<string, any>>(flagName: keyof FeatureFlags): Promise<T> {
    const flag = await this.get(flagName)
    return flag.config as T
  }

  /**
   * Force refresh cache
   */
  invalidateCache(): void {
    this.cache = null
    this.lastFetch = 0
  }

  /**
   * Get default flags (fallback when DB is unavailable)
   */
  private getDefaults(): FeatureFlags {
    return {
      query_planner: {
        enabled: false,
        config: { model: 'qwen2.5:3b-instruct' }
      },
      query_expansion: {
        enabled: false,
        config: { max_variations: 2 }
      },
      answer_verification: {
        enabled: false,
        config: { min_faithfulness: 0.7 }
      },
      cross_encoder_reranking: {
        enabled: false,
        config: { max_chars: 500 }
      },
      response_caching: {
        enabled: false,
        config: { ttl_seconds: 300, max_size_mb: 50 }
      }
    }
  }
}

// Singleton instance (lazy initialized)
let featureFlagService: FeatureFlagService | null = null

/**
 * Get or create feature flag service instance
 */
export function getFeatureFlagService(supabase: SupabaseClient): FeatureFlagService {
  if (!featureFlagService) {
    featureFlagService = new FeatureFlagService(supabase)
  }
  return featureFlagService
}
