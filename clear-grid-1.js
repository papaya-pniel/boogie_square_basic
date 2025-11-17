// Utility script to clear/wipe grid 1
// Run this in the browser console while on the app, or use it as a Node.js script

// For browser console usage:
// Copy and paste this into the browser console on your app

const clearGrid1 = async () => {
  try {
    console.log('🗑️ Starting to clear grid 1...');
    
    // Import Amplify functions (if running in browser console, these should already be available)
    const { uploadData } = await import('aws-amplify/storage');
    
    // Grid 1 keys (new format)
    const gridKey = 'shared-boogie-grid-1';
    const takesKey = 'shared-boogie-takes-1';
    const contribsKey = 'shared-boogie-contributions-1';
    
    // Legacy keys (for backward compatibility)
    const legacyGridKey = 'shared-boogie-grid';
    const legacyTakesKey = 'shared-boogie-video-takes';
    const legacyContribsKey = 'shared-boogie-contributions';
    
    // Create empty data
    const emptyGrid = Array(16).fill(null);
    const emptyTakes = Array(16).fill(null).map(() => ({ take1: null, take2: null, take3: null }));
    const emptyContribs = [];
    
    // Upload empty data to S3 (both new and legacy keys)
    const s3Keys = [
      { key: `shared-data/${gridKey}.json`, data: JSON.stringify(emptyGrid) },
      { key: `shared-data/${takesKey}.json`, data: JSON.stringify(emptyTakes) },
      { key: `shared-data/${contribsKey}.json`, data: JSON.stringify(emptyContribs) },
      { key: `shared-data/${legacyGridKey}.json`, data: JSON.stringify(emptyGrid) },
      { key: `shared-data/${legacyTakesKey}.json`, data: JSON.stringify(emptyTakes) },
      { key: `shared-data/${legacyContribsKey}.json`, data: JSON.stringify(emptyContribs) }
    ];
    
    for (const item of s3Keys) {
      try {
        await uploadData({
          key: item.key,
          data: item.data,
          options: {
            contentType: 'application/json',
            level: 'public'
          }
        });
        console.log(`✅ Cleared ${item.key}`);
      } catch (error) {
        console.error(`❌ Error clearing ${item.key}:`, error);
      }
    }
    
    // Also clear localStorage (both new and legacy keys)
    localStorage.removeItem(gridKey);
    localStorage.removeItem(takesKey);
    localStorage.removeItem(contribsKey);
    localStorage.removeItem(legacyGridKey);
    localStorage.removeItem(legacyTakesKey);
    localStorage.removeItem(legacyContribsKey);
    console.log('✅ Cleared localStorage');
    
    console.log('🎉 Grid 1 has been cleared! Refresh the page to see the empty grid.');
    
  } catch (error) {
    console.error('❌ Error clearing grid 1:', error);
  }
};

// Run it
clearGrid1();

