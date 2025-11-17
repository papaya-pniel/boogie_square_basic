# How to Clear/Wipe Grid 1

## Option 1: Browser Console (Easiest)

1. Open your app in the browser
2. Open the browser console (F12 or Cmd+Option+I)
3. Copy and paste this code:

```javascript
const clearGrid1 = async () => {
  try {
    console.log('🗑️ Starting to clear grid 1...');
    
    const { uploadData } = await import('aws-amplify/storage');
    
    // New grid-1 keys
    const gridKey = 'shared-boogie-grid-1';
    const takesKey = 'shared-boogie-takes-1';
    const contribsKey = 'shared-boogie-contributions-1';
    
    // Legacy keys (for backward compatibility)
    const legacyGridKey = 'shared-boogie-grid';
    const legacyTakesKey = 'shared-boogie-video-takes';
    const legacyContribsKey = 'shared-boogie-contributions';
    
    const emptyGrid = Array(16).fill(null);
    const emptyTakes = Array(16).fill(null).map(() => ({ take1: null, take2: null, take3: null }));
    const emptyContribs = [];
    
    // Clear both new and legacy keys
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
    
    // Clear localStorage (both new and legacy keys)
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

clearGrid1();
```

4. Press Enter to run it
5. Refresh the page

## Option 2: Direct S3 Access

If you have AWS console access, you can delete these files from S3:
- `shared-data/shared-boogie-grid-1.json`
- `shared-data/shared-boogie-takes-1.json`
- `shared-data/shared-boogie-contributions-1.json`

## Option 3: Clear localStorage Only (Temporary)

This only clears local cache, not the actual S3 data:

```javascript
localStorage.removeItem('shared-boogie-grid-1');
localStorage.removeItem('shared-boogie-takes-1');
localStorage.removeItem('shared-boogie-contributions-1');
location.reload();
```

