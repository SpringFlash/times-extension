import { getCurrentUserWorklogsForMonth } from "../api/tempo.js";
import { fetchTimeEntries } from "../api/redmine.js";
import JiraRestAPI from "../api/jira-rest.js";

/**
 * Utility for comparing time entries between Tempo and Redmine
 */
export class TimeComparisonUtils {
  /**
   * Compare time entries between Tempo and Redmine for a specific month
   * @param {number} year - Year (e.g., 2024)
   * @param {number} month - Month (1-12)
   * @param {Object} tempoSettings - Tempo API settings
   * @param {Object} redmineSettings - Redmine API settings
   * @param {Object} jiraSettings - Jira API settings (optional for enhanced comparison)
   * @returns {Promise<Object>} Comparison results
   */
  static async compareMonthlyEntries(
    year,
    month,
    tempoSettings,
    redmineSettings,
    jiraSettings = null
  ) {
    try {
      // Get date range for the month
      const startDate = `${year}-${month.toString().padStart(2, "0")}-01`;
      const endDate = new Date(year, month, 0).toISOString().split("T")[0]; // Last day of month

      console.log(
        `🔍 Comparing entries for ${year}-${month} (${startDate} to ${endDate})`
      );

      // Fetch data from both systems in parallel with enriched data if Jira settings provided
      const [tempoResult, redmineResult] = await Promise.all([
        getCurrentUserWorklogsForMonth(
          year,
          month,
          tempoSettings,
          jiraSettings
        ),
        fetchTimeEntries(startDate, endDate, redmineSettings),
      ]);

      if (!tempoResult.success) {
        throw new Error(`Tempo API error: ${tempoResult.error}`);
      }

      if (!redmineResult.success) {
        throw new Error(`Redmine API error: ${redmineResult.error}`);
      }

      // Normalize data for comparison (data is now embedded directly)
      const tempoEntries = this.normalizeTempoEntries(tempoResult.worklogs);
      const redmineEntries = this.normalizeRedmineEntries(
        redmineResult.timeEntries
      );

      // Perform comparison (always with enriched logic)
      const comparison = this.performComparison(tempoEntries, redmineEntries);

      const result = {
        success: true,
        period: { year, month, startDate, endDate },
        tempo: {
          total: tempoEntries.length,
          totalHours: tempoEntries.reduce((sum, entry) => sum + entry.hours, 0),
          entries: tempoEntries,
        },
        redmine: {
          total: redmineEntries.length,
          totalHours: redmineEntries.reduce(
            (sum, entry) => sum + entry.hours,
            0
          ),
          entries: redmineEntries,
        },
        comparison,
      };

      // Data is now embedded directly in entries, no need for separate enrichedData

      // Add mapping stats if available
      if (comparison.mappingStats) {
        result.mappingStats = comparison.mappingStats;
      }

      return result;
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Normalize Tempo worklog entries for comparison
   * @param {Array} worklogs - Raw Tempo worklogs (with embedded jira data)
   * @returns {Array} Normalized entries
   */
  static normalizeTempoEntries(worklogs) {
    return worklogs.map((worklog) => {
      const entry = {
        id: worklog.tempoWorklogId,
        date: worklog.startDate,
        hours: worklog.timeSpentSeconds / 3600,
        description: worklog.description || "",
        issueKey:
          worklog.issue?.key ||
          (worklog.issue?.id ? String(worklog.issue.id) : null),
        issueId: worklog.issue?.id || null,
        source: "tempo",
        raw: worklog,
      };

      // Add embedded Jira data if available
      if (worklog.jira) {
        entry.jiraCode = worklog.jira.code;
        entry.jiraUrl = worklog.jira.url;
      }

      return entry;
    });
  }

  /**
   * Normalize Redmine time entries for comparison
   * @param {Array} timeEntries - Raw Redmine time entries (with embedded jira data)
   * @returns {Array} Normalized entries
   */
  static normalizeRedmineEntries(timeEntries) {
    return timeEntries.map((entry) => {
      const normalizedEntry = {
        id: entry.id,
        date: entry.spent_on,
        hours: entry.hours,
        description: entry.comments || "",
        issueKey: entry.issue?.id ? `${entry.issue.id}` : null,
        issueId: entry.issue?.id || null,
        source: "redmine",
        raw: entry,
      };

      // Add embedded Jira data if available
      if (entry.jira) {
        normalizedEntry.jiraCode = entry.jira.code;
        normalizedEntry.jiraUrl = entry.jira.url;
      }

      return normalizedEntry;
    });
  }

  /**
   * Perform detailed comparison between normalized entries
   * @param {Array} tempoEntries - Normalized Tempo entries (with enriched data)
   * @param {Array} redmineEntries - Normalized Redmine entries (with enriched data)
   * @returns {Object} Comparison results
   */
  static performComparison(tempoEntries, redmineEntries) {
    const missingInRedmine = [];
    const matchedEntries = [];
    const duplicates = [];
    const discrepancies = [];

    // Group entries by date for easier comparison
    const redmineByDate = this.groupEntriesByDate(redmineEntries);
    const tempoByDate = this.groupEntriesByDate(tempoEntries);

    // Check each Tempo entry against Redmine entries
    for (const tempoEntry of tempoEntries) {
      const dateEntries = redmineByDate[tempoEntry.date] || [];

      // Try to find matching entry in Redmine (always use enriched logic)
      const match = this.findEnrichedMatchingEntry(tempoEntry, dateEntries);

      if (!match) {
        // No matching entry found in Redmine
        const missingEntry = {
          tempoEntry,
          reason: "not_found",
          suggestions: this.getSuggestions(tempoEntry, dateEntries),
          taskMapping: this.analyzeTaskMapping(tempoEntry, redmineEntries),
        };

        // Copy embedded Jira data to top level for easier access
        if (tempoEntry.jiraCode) {
          missingEntry.jiraCode = tempoEntry.jiraCode;
          missingEntry.jiraUrl = tempoEntry.jiraUrl;
        }

        missingInRedmine.push(missingEntry);
      } else if (match.type === "exact") {
        // Exact match found
        matchedEntries.push({
          tempoEntry,
          redmineEntry: match.entry,
          matchType: "exact",
          similarity: match.similarity || 1.0,
          reasons: match.reasons || ["exact_match"],
        });
      } else if (match.type === "partial") {
        // Partial match with discrepancies
        discrepancies.push({
          tempoEntry,
          redmineEntry: match.entry,
          differences: match.differences,
          hoursDifference: tempoEntry.hours - match.entry.hours,
          type: "hours_mismatch",
        });
      }
    }

    // Find potential duplicates in Redmine
    for (const [date, entries] of Object.entries(redmineByDate)) {
      if (entries.length > 1) {
        const grouped = this.groupSimilarEntries(entries);
        for (const group of grouped) {
          if (group.length > 1) {
            duplicates.push({
              date,
              entries: group,
              reason: "similar_entries",
            });
          }
        }
      }
    }

    // Calculate summary statistics
    const summary = this.calculateSummary(tempoEntries, redmineEntries, {
      missing: missingInRedmine,
      matched: matchedEntries,
      discrepancies,
      duplicates,
    });

    const result = {
      summary,
      missingInRedmine,
      matchedEntries,
      discrepancies,
      duplicates,
      byDate: this.createDateComparison(tempoByDate, redmineByDate),
    };

    // Always add enriched mapping statistics
    result.mappingStats = this.generateEnrichedMappingStats(
      tempoEntries,
      redmineEntries,
      matchedEntries
    );

    return result;
  }

  /**
   * Group entries by date
   * @param {Array} entries - Normalized entries
   * @returns {Object} Entries grouped by date
   */
  static groupEntriesByDate(entries) {
    return entries.reduce((groups, entry) => {
      const date = entry.date;
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(entry);
      return groups;
    }, {});
  }

  /**
   * Find matching entry in Redmine for a Tempo entry
   * @param {Object} tempoEntry - Tempo entry to match
   * @param {Array} redmineEntries - Redmine entries for the same date
   * @returns {Object|null} Match result or null
   */
  static findMatchingEntry(tempoEntry, redmineEntries) {
    for (const redmineEntry of redmineEntries) {
      const match = this.compareEntries(tempoEntry, redmineEntry);
      if (match.score > 0.8) {
        return {
          type: match.score === 1 ? "exact" : "partial",
          entry: redmineEntry,
          score: match.score,
          differences: match.differences,
        };
      }
    }
    return null;
  }

  /**
   * Find matching Redmine entry using embedded Jira data
   * @param {Object} tempoEntry - Tempo entry with embedded Jira data
   * @param {Array} redmineEntries - Redmine entries for the same date
   * @returns {Object|null} Match result or null
   */
  static findEnrichedMatchingEntry(tempoEntry, redmineEntries) {
    const matches = [];

    redmineEntries.forEach((redmineEntry) => {
      let similarity = 0;
      const reasons = [];

      // Check if Jira code from Tempo matches Jira code in Redmine entry
      if (tempoEntry.jiraCode && redmineEntry.jiraCode) {
        if (tempoEntry.jiraCode === redmineEntry.jiraCode) {
          similarity += 0.8; // High similarity for Jira code match
          reasons.push("jira_code_match");
        }
      }

      // Check hours similarity
      if (Math.abs(tempoEntry.hours - redmineEntry.hours) < 0.1) {
        similarity += 0.3;
        reasons.push("hours_match");
      } else if (Math.abs(tempoEntry.hours - redmineEntry.hours) < 0.5) {
        similarity += 0.1;
        reasons.push("hours_similar");
      }

      // Check description similarity
      const descSimilarity = this.calculateDescriptionSimilarity(
        tempoEntry.description,
        redmineEntry.description
      );
      similarity += descSimilarity * 0.2;
      if (descSimilarity > 0.5) {
        reasons.push("description_similar");
      }

      // Consider it a match if similarity is above threshold
      if (similarity >= 0.5) {
        matches.push({
          entry: redmineEntry,
          similarity,
          reasons,
        });
      }
    });

    if (matches.length === 0) {
      return null;
    }

    // Sort by similarity (highest first) and return best match
    matches.sort((a, b) => b.similarity - a.similarity);
    const bestMatch = matches[0];

    return {
      type: bestMatch.similarity >= 0.9 ? "exact" : "partial",
      entry: bestMatch.entry,
      score: bestMatch.similarity,
      similarity: bestMatch.similarity,
      reasons: bestMatch.reasons,
      differences: bestMatch.similarity < 1 ? ["enriched_partial_match"] : [],
    };
  }

  /**
   * Compare two entries and calculate similarity score
   * @param {Object} tempoEntry - Tempo entry
   * @param {Object} redmineEntry - Redmine entry
   * @returns {Object} Comparison result with score and differences
   */
  static compareEntries(tempoEntry, redmineEntry) {
    const differences = [];
    let score = 0;
    let maxScore = 0;

    // Compare hours (most important)
    maxScore += 0.4;
    const hoursDiff = Math.abs(tempoEntry.hours - redmineEntry.hours);
    if (hoursDiff < 0.1) {
      score += 0.4; // Exact match
    } else if (hoursDiff < 0.5) {
      score += 0.3; // Close match
    } else if (hoursDiff < 1) {
      score += 0.2; // Acceptable difference
      differences.push({
        field: "hours",
        tempo: tempoEntry.hours,
        redmine: redmineEntry.hours,
        difference: hoursDiff,
      });
    } else {
      differences.push({
        field: "hours",
        tempo: tempoEntry.hours,
        redmine: redmineEntry.hours,
        difference: hoursDiff,
      });
    }

    // Compare issue reference
    maxScore += 0.3;
    if (tempoEntry.issueKey && redmineEntry.issueKey) {
      if (tempoEntry.issueKey === redmineEntry.issueKey) {
        score += 0.3;
      } else {
        differences.push({
          field: "issue",
          tempo: tempoEntry.issueKey,
          redmine: redmineEntry.issueKey,
        });
      }
    } else if (!tempoEntry.issueKey && !redmineEntry.issueKey) {
      score += 0.15; // Both have no issue reference
    }

    // Compare description similarity
    maxScore += 0.3;
    const descSimilarity = this.calculateStringSimilarity(
      tempoEntry.description,
      redmineEntry.description
    );
    score += descSimilarity * 0.3;

    if (descSimilarity < 0.7) {
      differences.push({
        field: "description",
        tempo: tempoEntry.description,
        redmine: redmineEntry.description,
        similarity: descSimilarity,
      });
    }

    return {
      score: maxScore > 0 ? score / maxScore : 0,
      differences,
    };
  }

  /**
   * Calculate string similarity using Levenshtein distance
   * @param {string} str1 - First string
   * @param {string} str2 - Second string
   * @returns {number} Similarity score (0-1)
   */
  static calculateStringSimilarity(str1, str2) {
    if (!str1 && !str2) return 1;
    if (!str1 || !str2) return 0;

    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();

    if (s1 === s2) return 1;

    const maxLength = Math.max(s1.length, s2.length);
    if (maxLength === 0) return 1;

    const distance = this.levenshteinDistance(s1, s2);
    return (maxLength - distance) / maxLength;
  }

  /**
   * Calculate Levenshtein distance between two strings
   * @param {string} str1 - First string
   * @param {string} str2 - Second string
   * @returns {number} Edit distance
   */
  static levenshteinDistance(str1, str2) {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1 // deletion
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Get suggestions for missing entries
   * @param {Object} tempoEntry - Tempo entry
   * @param {Array} redmineEntries - Available Redmine entries for the date
   * @returns {Array} Suggestions
   */
  static getSuggestions(tempoEntry, redmineEntries) {
    const suggestions = [];

    // Check for similar hours
    const similarHours = redmineEntries.filter(
      (entry) => Math.abs(entry.hours - tempoEntry.hours) < 0.5
    );
    if (similarHours.length > 0) {
      suggestions.push({
        type: "similar_hours",
        entries: similarHours,
        message: `Found ${similarHours.length} entries with similar hours`,
      });
    }

    // Check for similar descriptions
    const similarDesc = redmineEntries.filter(
      (entry) =>
        this.calculateStringSimilarity(
          entry.description,
          tempoEntry.description
        ) > 0.6
    );
    if (similarDesc.length > 0) {
      suggestions.push({
        type: "similar_description",
        entries: similarDesc,
        message: `Found ${similarDesc.length} entries with similar descriptions`,
      });
    }

    return suggestions;
  }

  /**
   * Group similar entries together
   * @param {Array} entries - Entries to group
   * @returns {Array} Groups of similar entries
   */
  static groupSimilarEntries(entries) {
    const groups = [];
    const processed = new Set();

    for (let i = 0; i < entries.length; i++) {
      if (processed.has(i)) continue;

      const group = [entries[i]];
      processed.add(i);

      for (let j = i + 1; j < entries.length; j++) {
        if (processed.has(j)) continue;

        const similarity = this.compareEntries(entries[i], entries[j]);
        if (similarity.score > 0.8) {
          group.push(entries[j]);
          processed.add(j);
        }
      }

      groups.push(group);
    }

    return groups;
  }

  /**
   * Calculate summary statistics
   * @param {Array} tempoEntries - Tempo entries
   * @param {Array} redmineEntries - Redmine entries
   * @param {Object} comparisonResults - Comparison results
   * @returns {Object} Summary statistics
   */
  static calculateSummary(tempoEntries, redmineEntries, comparisonResults) {
    const tempoHours = tempoEntries.reduce(
      (sum, entry) => sum + entry.hours,
      0
    );
    const redmineHours = redmineEntries.reduce(
      (sum, entry) => sum + entry.hours,
      0
    );
    const missingHours = comparisonResults.missing.reduce(
      (sum, item) => sum + item.tempoEntry.hours,
      0
    );

    return {
      tempo: {
        totalEntries: tempoEntries.length,
        totalHours: tempoHours,
      },
      redmine: {
        totalEntries: redmineEntries.length,
        totalHours: redmineHours,
      },
      missing: {
        entries: comparisonResults.missing.length,
        hours: missingHours,
        percentage:
          tempoEntries.length > 0
            ? (comparisonResults.missing.length / tempoEntries.length) * 100
            : 0,
      },
      matched: {
        entries: comparisonResults.matched.length,
        percentage:
          tempoEntries.length > 0
            ? (comparisonResults.matched.length / tempoEntries.length) * 100
            : 0,
      },
      discrepancies: {
        entries: comparisonResults.discrepancies.length,
      },
      hoursDifference: tempoHours - redmineHours,
    };
  }

  /**
   * Create date-by-date comparison
   * @param {Object} tempoByDate - Tempo entries grouped by date
   * @param {Object} redmineByDate - Redmine entries grouped by date
   * @returns {Object} Date comparison
   */
  static createDateComparison(tempoByDate, redmineByDate) {
    const allDates = new Set([
      ...Object.keys(tempoByDate),
      ...Object.keys(redmineByDate),
    ]);

    const comparison = {};

    for (const date of allDates) {
      const tempoEntries = tempoByDate[date] || [];
      const redmineEntries = redmineByDate[date] || [];

      const tempoHours = tempoEntries.reduce(
        (sum, entry) => sum + entry.hours,
        0
      );
      const redmineHours = redmineEntries.reduce(
        (sum, entry) => sum + entry.hours,
        0
      );

      comparison[date] = {
        tempo: {
          entries: tempoEntries.length,
          hours: tempoHours,
        },
        redmine: {
          entries: redmineEntries.length,
          hours: redmineHours,
        },
        difference: {
          entries: tempoEntries.length - redmineEntries.length,
          hours: tempoHours - redmineHours,
        },
        status: this.getDateStatus(tempoEntries, redmineEntries),
      };
    }

    return comparison;
  }

  /**
   * Get status for a specific date comparison
   * @param {Array} tempoEntries - Tempo entries for the date
   * @param {Array} redmineEntries - Redmine entries for the date
   * @returns {string} Status
   */
  static getDateStatus(tempoEntries, redmineEntries) {
    if (tempoEntries.length === 0 && redmineEntries.length === 0) {
      return "no_entries";
    }
    if (tempoEntries.length > 0 && redmineEntries.length === 0) {
      return "missing_in_redmine";
    }
    if (tempoEntries.length === 0 && redmineEntries.length > 0) {
      return "extra_in_redmine";
    }

    const tempoHours = tempoEntries.reduce(
      (sum, entry) => sum + entry.hours,
      0
    );
    const redmineHours = redmineEntries.reduce(
      (sum, entry) => sum + entry.hours,
      0
    );
    const hoursDiff = Math.abs(tempoHours - redmineHours);

    if (hoursDiff < 0.1) {
      return "matched";
    } else if (hoursDiff < 1) {
      return "minor_difference";
    } else {
      return "major_difference";
    }
  }

  /**
   * Enhance comparison with Jira task mapping
   * @param {Object} basicComparison - Basic comparison results
   * @param {Object} jiraSettings - Jira API settings
   * @param {Object} redmineSettings - Redmine API settings
   * @param {Function} searchRedmineIssues - Redmine search function
   * @returns {Promise<Object>} Enhanced comparison with task mapping
   */
  static async enhanceWithTaskMapping(
    basicComparison,
    jiraSettings,
    redmineSettings,
    searchRedmineIssues
  ) {
    try {
      // Extract unique Jira issue keys and IDs from Tempo entries
      const jiraKeys = new Set();
      const jiraIds = new Set();

      basicComparison.tempo.entries.forEach((entry) => {
        // If we have a valid Jira key, use it
        if (
          entry.issueKey &&
          typeof entry.issueKey === "string" &&
          entry.issueKey.match(/^[A-Z]+-\d+$/)
        ) {
          jiraKeys.add(entry.issueKey);
        }
        // If we have a Jira issue ID but no valid key, collect the ID
        else if (entry.issueId && !entry.issueKey?.match(/^[A-Z]+-\d+$/)) {
          jiraIds.add(entry.issueId);
        }
      });

      console.log(
        `🎫 Found ${jiraKeys.size} Jira keys and ${jiraIds.size} Jira IDs in Tempo entries`
      );

      // Get Jira issue details and find linked Redmine issues
      const taskMappings = [];
      const jiraIssues = {};
      const linkedRedmineIssues = {};

      // First, get issues by ID to resolve their keys
      for (const jiraId of jiraIds) {
        console.log(`🔍 Processing Jira issue ID: ${jiraId}`);

        try {
          // Get Jira issue details by ID
          const jiraResult = await JiraRestAPI.getIssue(jiraId, jiraSettings, [
            "description",
          ]);

          if (jiraResult.success) {
            const normalizedJira = JiraRestAPI.normalizeJiraIssue(
              jiraResult.issue
            );
            const jiraKey = normalizedJira.key;

            // Add the resolved key to our keys set
            jiraKeys.add(jiraKey);
            jiraIssues[jiraKey] = normalizedJira;

            console.log(`  ✅ Resolved ID ${jiraId} to key ${jiraKey}`);
          } else {
            console.log(
              `  ❌ Failed to get Jira issue by ID ${jiraId}: ${jiraResult.error}`
            );
          }
        } catch (error) {
          console.error(
            `  ❌ Error processing Jira ID ${jiraId}:`,
            error.message
          );
        }
      }

      // Now process all issues by their keys
      for (const jiraKey of jiraKeys) {
        console.log(`🔍 Processing Jira issue: ${jiraKey}`);

        try {
          // Skip if we already have this issue (resolved from ID)
          if (jiraIssues[jiraKey]) {
            console.log(
              `  ⏭️ Already have issue ${jiraKey}, skipping API call`
            );
          } else {
            // Get Jira issue details
            const jiraResult = await JiraRestAPI.getIssue(
              jiraKey,
              jiraSettings,
              ["description"]
            );

            if (jiraResult.success) {
              const normalizedJira = JiraRestAPI.normalizeJiraIssue(
                jiraResult.issue
              );
              jiraIssues[jiraKey] = normalizedJira;
            } else {
              console.log(`  ❌ Failed to get Jira issue: ${jiraResult.error}`);
              taskMappings.push({
                jiraKey,
                jiraIssue: null,
                redmineIssues: [],
                linkCount: 0,
                error: jiraResult.error,
              });
              continue;
            }
          }

          // Find linked Redmine issues (for both existing and newly fetched issues)
          const currentJiraIssue = jiraIssues[jiraKey];
          if (currentJiraIssue) {
            const linkResult = await JiraRestAPI.findLinkedRedmineIssues(
              jiraKey,
              jiraSettings,
              redmineSettings,
              searchRedmineIssues
            );

            if (linkResult.success) {
              linkedRedmineIssues[jiraKey] = linkResult.linkedRedmineIssues;

              taskMappings.push({
                jiraKey,
                jiraIssue: currentJiraIssue,
                redmineIssues: linkResult.linkedRedmineIssues,
                linkCount: linkResult.totalLinked,
                searchResults: linkResult.searchResults,
              });

              console.log(
                `  ✅ Found ${linkResult.totalLinked} linked Redmine issues`
              );
            } else {
              console.log(
                `  ⚠️ Failed to find linked issues: ${linkResult.error}`
              );
              taskMappings.push({
                jiraKey,
                jiraIssue: currentJiraIssue,
                redmineIssues: [],
                linkCount: 0,
                error: linkResult.error,
              });
            }
          }
        } catch (error) {
          console.error(`  ❌ Error processing ${jiraKey}:`, error.message);
          taskMappings.push({
            jiraKey,
            jiraIssue: null,
            redmineIssues: [],
            linkCount: 0,
            error: error.message,
          });
        }
      }

      // Analyze task mapping results
      const mappingStats = this.analyzeTaskMapping(
        taskMappings,
        basicComparison
      );

      // Enhance missing entries with task information
      const enhancedMissingEntries = this.enhanceMissingEntriesWithTasks(
        basicComparison.comparison.missingInRedmine,
        taskMappings,
        jiraIssues,
        linkedRedmineIssues
      );

      return {
        taskMappings,
        jiraIssues,
        linkedRedmineIssues,
        mappingStats,
        enhancedMissingEntries,
        totalJiraIssues: jiraKeys.size,
        totalMappedIssues: taskMappings.filter((m) => m.linkCount > 0).length,
      };
    } catch (error) {
      console.error("❌ Error enhancing with task mapping:", error);

      // Return basic missing entries even if enhancement fails
      const basicMissingEntries =
        basicComparison.comparison.missingInRedmine || [];

      return {
        error: error.message,
        taskMappings: [],
        jiraIssues: {},
        linkedRedmineIssues: {},
        enhancedMissingEntries: basicMissingEntries, // Add this!
        mappingStats: {
          totalJiraIssues: 0,
          mappedIssues: 0,
          unmappedIssues: 0,
          multiMappedIssues: 0,
          errorIssues: 0,
          mappingRate: 0,
        },
      };
    }
  }

  /**
   * Analyze task mapping statistics
   * @param {Array} taskMappings - Task mapping results
   * @param {Object} basicComparison - Basic comparison results
   * @returns {Object} Mapping statistics
   */
  static analyzeTaskMapping(taskMappings, basicComparison) {
    const stats = {
      totalJiraIssues: taskMappings.length,
      mappedIssues: taskMappings.filter((m) => m.linkCount > 0).length,
      unmappedIssues: taskMappings.filter((m) => m.linkCount === 0).length,
      multiMappedIssues: taskMappings.filter((m) => m.linkCount > 1).length,
      errorIssues: taskMappings.filter((m) => m.error).length,
      mappingRate: 0,
    };

    if (stats.totalJiraIssues > 0) {
      stats.mappingRate = (stats.mappedIssues / stats.totalJiraIssues) * 100;
    }

    // Analyze impact on missing entries
    const missingWithTasks = basicComparison.comparison.missingInRedmine.filter(
      (item) =>
        item.tempoEntry.issueKey && typeof item.tempoEntry.issueKey === "string"
    );
    const missingWithMappedTasks = missingWithTasks.filter((item) => {
      const mapping = taskMappings.find(
        (m) => m.jiraKey === item.tempoEntry.issueKey
      );
      return mapping && mapping.linkCount > 0;
    });

    stats.missingEntries = {
      total: basicComparison.comparison.missingInRedmine.length,
      withJiraTasks: missingWithTasks.length,
      withMappedTasks: missingWithMappedTasks.length,
      withoutTasks:
        basicComparison.comparison.missingInRedmine.length -
        missingWithTasks.length,
    };

    return stats;
  }

  /**
   * Enhance missing entries with task information
   * @param {Array} missingEntries - Missing entries from basic comparison
   * @param {Array} taskMappings - Task mapping results
   * @param {Object} jiraIssues - Jira issues data
   * @param {Object} linkedRedmineIssues - Linked Redmine issues
   * @returns {Array} Enhanced missing entries
   */
  static enhanceMissingEntriesWithTasks(
    missingEntries,
    taskMappings,
    jiraIssues,
    linkedRedmineIssues
  ) {
    return missingEntries.map((item) => {
      const tempoEntry = item.tempoEntry;
      const jiraKey = tempoEntry.issueKey;
      const jiraId = tempoEntry.issueId;

      // Try to find the issue by key first, then by resolved key from ID
      let resolvedJiraKey = null;
      let mapping = null;
      let jiraIssue = null;
      let redmineIssues = [];

      // If we have a valid Jira key, use it directly
      if (
        jiraKey &&
        typeof jiraKey === "string" &&
        jiraKey.match(/^[A-Z]+-\d+$/)
      ) {
        resolvedJiraKey = jiraKey;
      }
      // If we have a Jira ID, try to find the resolved key
      else if (jiraId) {
        // Find the resolved key for this ID
        resolvedJiraKey = Object.keys(jiraIssues).find(
          (key) => jiraIssues[key] && jiraIssues[key].id === jiraId
        );
      }

      if (!resolvedJiraKey) {
        return {
          ...item,
          taskInfo: {
            hasJiraTask: !!jiraId,
            jiraKey: jiraKey || (jiraId ? String(jiraId) : null),
            jiraIssue: null,
            linkedRedmineIssues: [],
            mappingStatus: jiraId ? "jira_id_unresolved" : "no_jira_task",
          },
        };
      }

      mapping = taskMappings.find((m) => m.jiraKey === resolvedJiraKey);
      jiraIssue = jiraIssues[resolvedJiraKey] || null;
      redmineIssues = linkedRedmineIssues[resolvedJiraKey] || [];

      let mappingStatus = "unknown";
      if (mapping) {
        if (mapping.error) {
          mappingStatus = "error";
        } else if (mapping.linkCount === 0) {
          mappingStatus = "no_redmine_link";
        } else if (mapping.linkCount === 1) {
          mappingStatus = "single_link";
        } else {
          mappingStatus = "multiple_links";
        }
      } else if (resolvedJiraKey) {
        // We have a Jira key but no mapping - this means it was processed but had no links
        mappingStatus = "no_redmine_link";
      } else if (jiraId) {
        mappingStatus = "jira_id_unresolved";
      } else {
        mappingStatus = "no_jira_task";
      }

      return {
        ...item,
        taskInfo: {
          hasJiraTask: true,
          jiraKey: resolvedJiraKey,
          originalKey: jiraKey,
          originalId: jiraId,
          jiraIssue,
          linkedRedmineIssues: redmineIssues,
          linkCount: redmineIssues.length,
          mappingStatus,
          error: mapping?.error || null,
        },
      };
    });
  }

  /**
   * Format comparison results for display
   * @param {Object} results - Comparison results
   * @returns {Object} Formatted results
   */
  static formatResults(results) {
    if (!results.success) {
      return results;
    }

    const { comparison, period } = results;

    return {
      ...results,
      formatted: {
        title: `Time Comparison for ${period.year}-${period.month
          .toString()
          .padStart(2, "0")}`,
        summary: {
          overview: `Tempo: ${
            comparison.summary.tempo.totalEntries
          } entries (${comparison.summary.tempo.totalHours.toFixed(
            2
          )}h) | Redmine: ${
            comparison.summary.redmine.totalEntries
          } entries (${comparison.summary.redmine.totalHours.toFixed(2)}h)`,
          missing: `${
            comparison.summary.missing.entries
          } entries missing in Redmine (${comparison.summary.missing.hours.toFixed(
            2
          )}h, ${comparison.summary.missing.percentage.toFixed(1)}%)`,
          matched: `${
            comparison.summary.matched.entries
          } entries matched (${comparison.summary.matched.percentage.toFixed(
            1
          )}%)`,
          hoursDifference: `Hours difference: ${
            comparison.summary.hoursDifference > 0 ? "+" : ""
          }${comparison.summary.hoursDifference.toFixed(2)}h`,
        },
        missingEntries: comparison.missingInRedmine.map((item) => ({
          date: item.tempoEntry.date,
          hours: item.tempoEntry.hours.toFixed(2),
          description: item.tempoEntry.description || "No description",
          issueKey: item.tempoEntry.issueKey || "No issue",
          suggestions: item.suggestions.length,
        })),
      },
    };
  }

  /**
   * Find matching Redmine entries using enriched data
   * @param {Object} tempoEntry - Tempo entry with Jira data
   * @param {Array} redmineEntries - Redmine entries for the same date
   * @returns {Array} Array of matches with similarity scores
   */
  static findEnrichedMatches(tempoEntry, redmineEntries) {
    const matches = [];

    redmineEntries.forEach((redmineEntry) => {
      let similarity = 0;
      const reasons = [];

      // Check if Jira key from Tempo matches any Jira keys in Redmine issue
      if (tempoEntry.jiraIssue && redmineEntry.redmineIssue) {
        const tempoJiraKey = tempoEntry.jiraIssue.key;
        const redmineJiraKeys = redmineEntry.redmineIssue.jiraKeys || [];

        if (redmineJiraKeys.includes(tempoJiraKey)) {
          similarity += 0.8; // High similarity for Jira key match
          reasons.push("jira_key_match");
        }
      }

      // Check hours similarity
      if (Math.abs(tempoEntry.hours - redmineEntry.hours) < 0.1) {
        similarity += 0.3;
        reasons.push("hours_match");
      } else if (Math.abs(tempoEntry.hours - redmineEntry.hours) < 0.5) {
        similarity += 0.1;
        reasons.push("hours_similar");
      }

      // Check description similarity
      const descSimilarity = this.calculateDescriptionSimilarity(
        tempoEntry.description,
        redmineEntry.description
      );
      similarity += descSimilarity * 0.2;
      if (descSimilarity > 0.5) {
        reasons.push("description_similar");
      }

      // Consider it a match if similarity is above threshold
      if (similarity >= 0.5) {
        matches.push({
          entry: redmineEntry,
          similarity,
          reasons,
        });
      }
    });

    // Sort by similarity (highest first)
    return matches.sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * Analyze task mapping for a Tempo entry
   * @param {Object} tempoEntry - Tempo entry with embedded Jira data
   * @param {Array} relatedRedmineEntries - Related Redmine entries
   * @returns {Object} Task mapping analysis
   */
  static analyzeTaskMapping(tempoEntry, relatedRedmineEntries) {
    const mapping = {
      jiraCode: tempoEntry.jiraCode || null,
      jiraUrl: tempoEntry.jiraUrl || null,
      linkedRedmineIssues: [],
      mappingStatus: "no_mapping",
    };

    if (!tempoEntry.jiraCode) {
      mapping.mappingStatus = "no_jira_issue";
      return mapping;
    }

    // Find Redmine entries that have the same Jira code
    const linkedIssues = relatedRedmineEntries.filter(
      (entry) => entry.jiraCode === tempoEntry.jiraCode
    );

    if (linkedIssues.length > 0) {
      mapping.linkedRedmineIssues = linkedIssues.map((entry) => ({
        id: entry.issueId,
        jiraCode: entry.jiraCode,
        jiraUrl: entry.jiraUrl,
      }));

      if (linkedIssues.length === 1) {
        mapping.mappingStatus = "single_match";
      } else {
        mapping.mappingStatus = "multiple_matches";
      }
    } else {
      mapping.mappingStatus = "no_redmine_link";
    }

    return mapping;
  }

  /**
   * Generate enriched mapping statistics
   * @param {Array} tempoEntries - Tempo entries
   * @param {Array} redmineEntries - Redmine entries
   * @param {Array} matchedEntries - Matched entries
   * @returns {Object} Mapping statistics
   */
  static generateEnrichedMappingStats(
    tempoEntries,
    redmineEntries,
    matchedEntries
  ) {
    const stats = {
      totalTempoEntries: tempoEntries.length,
      entriesWithJiraIssues: 0,
      entriesWithLinkedRedmine: 0,
      mappingRate: 0,
      jiraKeysFound: new Set(),
      redmineJiraKeysFound: new Set(),
    };

    // Count Tempo entries with Jira codes
    tempoEntries.forEach((entry) => {
      if (entry.jiraCode) {
        stats.entriesWithJiraIssues++;
        stats.jiraKeysFound.add(entry.jiraCode);
      }
    });

    // Count Redmine entries with Jira codes
    redmineEntries.forEach((entry) => {
      if (entry.jiraCode) {
        stats.redmineJiraKeysFound.add(entry.jiraCode);
      }
    });

    // Count successful mappings
    matchedEntries.forEach((match) => {
      if (
        match.taskMapping?.mappingStatus === "single_match" ||
        match.taskMapping?.mappingStatus === "multiple_matches"
      ) {
        stats.entriesWithLinkedRedmine++;
      }
    });

    // Calculate mapping rate
    if (stats.entriesWithJiraIssues > 0) {
      stats.mappingRate =
        stats.entriesWithLinkedRedmine / stats.entriesWithJiraIssues;
    }

    // Convert Sets to Arrays for JSON serialization
    stats.jiraKeysFound = Array.from(stats.jiraKeysFound);
    stats.redmineJiraKeysFound = Array.from(stats.redmineJiraKeysFound);

    return stats;
  }

  /**
   * Calculate similarity between two text descriptions using Levenshtein distance
   * @param {string} text1 - First text
   * @param {string} text2 - Second text
   * @returns {number} Similarity score between 0 and 1
   */
  static calculateDescriptionSimilarity(text1, text2) {
    if (!text1 && !text2) return 1;
    if (!text1 || !text2) return 0;

    const str1 = text1.toLowerCase().trim();
    const str2 = text2.toLowerCase().trim();

    if (str1 === str2) return 1;

    // Calculate Levenshtein distance
    const matrix = [];
    const len1 = str1.length;
    const len2 = str2.length;

    for (let i = 0; i <= len2; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= len1; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= len2; i++) {
      for (let j = 1; j <= len1; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1 // deletion
          );
        }
      }
    }

    const distance = matrix[len2][len1];
    const maxLength = Math.max(len1, len2);

    return maxLength === 0 ? 1 : (maxLength - distance) / maxLength;
  }
}

export default TimeComparisonUtils;
