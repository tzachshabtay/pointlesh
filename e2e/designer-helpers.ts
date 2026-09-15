import { expect, type Page } from '@playwright/test';

export async function selectInstance(page: Page, instanceId: string) {
  const toggle = page.getByRole('button', { name: 'Toggle scene designer', exact: true });
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  await page.evaluate(instanceId => {
    const designer = (window as any).pointleshDemo.scene.sceneDesigner.designer;
    for (const scene of Object.values(designer.getManifest().scenes) as any[]) for (const layer of scene.layers) {
      const area = layer.areas.find((area: any) => area.id === instanceId || area.pointlesh?.entityId === instanceId);
      if (area) { designer.select({ type: 'area', sceneId: scene.id, layerId: layer.id, areaId: area.id }); return; }
      if (layer.prefabs?.some((instance: any) => instance.id === instanceId)) {
        designer.select({ type: 'prefab', sceneId: scene.id, layerId: layer.id, instanceId }); return;
      }
    }
    throw new Error(`Unknown instance ${instanceId}`);
  }, instanceId);
  await expect(page.getByRole('region', { name: 'Pointlesh properties', exact: true })).toBeVisible();
}

export async function expandProperties(page: Page, title: string) {
  const section = page.locator('details.pointlesh-property-section').filter({ has: page.getByText(title, { exact: true }) });
  if (await section.getAttribute('open') === null) await section.locator(':scope > summary').click();
}
