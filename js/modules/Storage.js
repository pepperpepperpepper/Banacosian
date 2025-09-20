/**
 * Storage Module - Handles Google Drive integration and data persistence
 */
class StorageModule {
    constructor(scoringModule) {
        this.scoringModule = scoringModule;
    }

    /**
     * Auto-save data to Google Drive
     * @param {Object} settings - Current settings
     */
    async autoSaveToGoogleDrive(settings) {
        try {
            // Auto-save after each round completion
            const saveData = {
                version: '1.0',
                savedAt: new Date().toISOString(),
                sessionStats: {
                    totalRounds: this.scoringModule.getRoundHistory().length,
                    averageAccuracy: this.scoringModule.calculateAverageAccuracy(),
                    bestRound: this.scoringModule.getBestRound()
                },
                currentRound: this.scoringModule.getCurrentRound(),
                overallScore: this.scoringModule.getScore(),
                roundHistory: this.scoringModule.getRoundHistory(),
                settings: settings
            };

            // Use a consistent filename for auto-saves
            const filename = 'melodic-dictation-autosave.json';
            await window.fs.writeFile(filename, JSON.stringify(saveData, null, 2));
            
            console.log('Auto-save completed successfully');
            
        } catch (error) {
            console.error('Auto-save failed:', error);
            // Don't show error to user for auto-save failures
        }
    }

    /**
     * Save data to Google Drive
     * @param {Object} settings - Current settings
     * @returns {Promise<string>} Success message
     */
    async saveToGoogleDrive(settings) {
        try {
            // Prepare data for saving
            const saveData = {
                version: '1.0',
                savedAt: new Date().toISOString(),
                sessionStats: {
                    totalRounds: this.scoringModule.getRoundHistory().length,
                    averageAccuracy: this.scoringModule.calculateAverageAccuracy(),
                    bestRound: this.scoringModule.getBestRound()
                },
                currentRound: this.scoringModule.getCurrentRound(),
                overallScore: this.scoringModule.getScore(),
                roundHistory: this.scoringModule.getRoundHistory(),
                settings: settings
            };

            // Create filename with timestamp
            const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
            const filename = `melodic-dictation-data-${timestamp}.json`;

            // Save to Google Drive using the fs API
            await window.fs.writeFile(filename, JSON.stringify(saveData, null, 2));
            
            return `✅ Data saved to Google Drive as ${filename}`;
            
        } catch (error) {
            console.error('Error saving to Google Drive:', error);
            throw new Error('❌ Error saving to Google Drive. Please try again.');
        }
    }

    /**
     * Load data from Google Drive
     * @returns {Promise<Object>} Loaded data and message
     */
    async loadFromGoogleDrive() {
        try {
            // First try to load the auto-save file
            let fileContent;
            let filename;
            
            try {
                fileContent = await window.fs.readFile('melodic-dictation-autosave.json', { encoding: 'utf8' });
                filename = 'melodic-dictation-autosave.json';
            } catch (autoSaveError) {
                // If auto-save doesn't exist, look for manual saves
                const files = await window.fs.list();
                const dataFiles = files.filter(f => f.name.includes('melodic-dictation-data') && f.name.endsWith('.json'));
                
                if (dataFiles.length === 0) {
                    return {
                        success: false,
                        message: '📂 No saved data files found in Google Drive.',
                        data: null
                    };
                }

                // Get the most recent manual save
                const mostRecentFile = dataFiles.sort((a, b) => new Date(b.modified) - new Date(a.modified))[0];
                fileContent = await window.fs.readFile(mostRecentFile.name, { encoding: 'utf8' });
                filename = mostRecentFile.name;
            }
            
            const loadedData = JSON.parse(fileContent);

            // Validate the data structure
            if (!loadedData.roundHistory || !loadedData.version) {
                throw new Error('Invalid data format');
            }

            // Restore the data using the scoring module
            this.scoringModule.loadScoreData(loadedData);

            const savedDate = new Date(loadedData.savedAt).toLocaleString();
            return {
                success: true,
                message: `✅ Data loaded from ${filename} (saved ${savedDate}). ${loadedData.roundHistory.length} rounds restored.`,
                data: loadedData
            };

        } catch (error) {
            console.error('Error loading from Google Drive:', error);
            throw new Error('❌ Error loading data from Google Drive. Please check the file format.');
        }
    }

    /**
     * Get current settings for saving
     * @param {number} sequenceLength - Current sequence length
     * @param {string} scaleType - Current scale type
     * @param {string} mode - Current mode
     * @returns {Object} Settings object
     */
    getCurrentSettings(sequenceLength, scaleType, mode) {
        return {
            sequenceLength: sequenceLength,
            scaleType: scaleType,
            mode: mode
        };
    }
}

// Export the module
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StorageModule;
} else {
    window.StorageModule = StorageModule;
}