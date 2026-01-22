# Hex Minimap Fullscreen Feature Design

## Overview

Add fullscreen expand capability to the SVG hex minimap in the bottom-right panel.

## User Experience

**Trigger**: Expand button in the top-right corner of the minimap panel.

**Fullscreen Overlay**:
- Dark semi-transparent backdrop (`bg-black/80`)
- Minimap centered, scaled to ~90% viewport (maintaining aspect ratio)
- Close button (X) in top-right corner
- Click backdrop to close
- Escape key to close

**Interactions**:
- All pan/zoom interactions work in fullscreen
- Camera position syncs between normal and fullscreen views
- Smooth fade-in/scale-up transition

## Technical Implementation

### Files to Modify

1. **`client/apps/game/src/ui/features/world/components/bottom-right-panel/hex-minimap.tsx`**
   - Add `isFullscreen` state
   - Add expand button to minimap header/corner
   - Conditionally render fullscreen overlay when expanded
   - Handle Escape key listener
   - Handle backdrop click

### Component Structure

```tsx
// In HexMinimap component:

const [isFullscreen, setIsFullscreen] = useState(false);

// Escape key handler
useEffect(() => {
  if (!isFullscreen) return;
  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') setIsFullscreen(false);
  };
  window.addEventListener('keydown', handleEscape);
  return () => window.removeEventListener('keydown', handleEscape);
}, [isFullscreen]);

// Render fullscreen overlay using Portal
{isFullscreen && createPortal(
  <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center"
       onClick={() => setIsFullscreen(false)}>
    <div className="relative w-[90vw] h-[90vh]"
         onClick={(e) => e.stopPropagation()}>
      <button className="absolute top-4 right-4 z-10"
              onClick={() => setIsFullscreen(false)}>
        X
      </button>
      {/* Minimap SVG content */}
    </div>
  </div>,
  document.body
)}

// Expand button in normal view
<button onClick={() => setIsFullscreen(true)}>
  <Expand icon />
</button>
```

### Styling

- Use existing game UI patterns (panel-wood, button styles)
- Backdrop: `bg-black/80`
- Transition: `transition-opacity duration-200`
- Z-index: Above all game UI (z-50 or higher)

## Acceptance Criteria

- [ ] Expand button visible in minimap corner
- [ ] Clicking expand opens fullscreen overlay
- [ ] Minimap fills ~90% of viewport in fullscreen
- [ ] Pan and zoom work in fullscreen mode
- [ ] Close button closes overlay
- [ ] Clicking backdrop closes overlay
- [ ] Escape key closes overlay
- [ ] Smooth transition animation
