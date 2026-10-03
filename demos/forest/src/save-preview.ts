import type Phaser from 'phaser';

/** Capture the rendered world, without menus or designer overlays, into a small durable thumbnail. */
export function captureSavePreview(scene: Phaser.Scene): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Could not capture the save preview. Please try again.')), 5000);
    try {
      scene.game.renderer.snapshot(image => {
        clearTimeout(timeout);
        try {
          if (!(image instanceof HTMLImageElement)) throw new Error('Could not capture the save preview.');
          const canvas = document.createElement('canvas');
          canvas.width = 320; canvas.height = Math.round(320 * image.height / image.width);
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Could not create the save preview.');
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        } catch (error) { reject(error); }
      });
    } catch (error) { clearTimeout(timeout); reject(error); }
  });
}
