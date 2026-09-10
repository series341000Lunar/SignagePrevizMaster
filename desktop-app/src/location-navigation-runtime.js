import * as THREE from 'three';

function finiteVector(value, keys) {
  return value && keys.every((key) => Number.isFinite(value[key]));
}

export function validateLocationRecord(record, photoSceneRecords) {
  if (!record || typeof record.locationId !== 'string') throw new TypeError('LocationRecord identity is required.');
  if (!finiteVector(record.worldPosition, ['x', 'y', 'z'])) throw new TypeError(`${record.locationId} requires a finite Three world position.`);
  if (!record.marker || !Number.isFinite(record.marker.uiOffsetX) || !Number.isFinite(record.marker.uiOffsetY)) {
    throw new TypeError(`${record.locationId} requires finite marker UI offsets.`);
  }
  const photoScene = photoSceneRecords.find((candidate) => candidate.sceneId === record.photoSceneId);
  if (!photoScene) throw new Error(`${record.locationId} has no matching PhotoScene.`);
  return photoScene;
}

export function projectLocationToViewport(worldPosition, camera, viewport, uiOffset = { x: 0, y: 0 }) {
  if (!finiteVector(worldPosition, ['x', 'y', 'z'])) return Object.freeze({ visible: false, reason: 'INVALID_POSITION' });
  if (!camera?.isCamera || !Number.isFinite(viewport?.width) || !Number.isFinite(viewport?.height) ||
      viewport.width <= 0 || viewport.height <= 0) {
    return Object.freeze({ visible: false, reason: 'INVALID_VIEWPORT' });
  }
  camera.updateMatrixWorld(true);
  const world = new THREE.Vector3(worldPosition.x, worldPosition.y, worldPosition.z);
  const cameraSpace = world.clone().applyMatrix4(camera.matrixWorldInverse);
  if (!Number.isFinite(cameraSpace.z) || cameraSpace.z >= 0) {
    return Object.freeze({ visible: false, reason: 'BEHIND_CAMERA' });
  }
  const ndc = world.project(camera);
  const visible = [ndc.x, ndc.y, ndc.z].every(Number.isFinite) &&
    ndc.x >= -1 && ndc.x <= 1 && ndc.y >= -1 && ndc.y <= 1 && ndc.z >= -1 && ndc.z <= 1;
  if (!visible) return Object.freeze({ visible: false, reason: 'OFFSCREEN', ndc: Object.freeze(ndc.toArray()) });
  return Object.freeze({
    visible: true,
    reason: null,
    ndc: Object.freeze(ndc.toArray()),
    x: ((ndc.x + 1) * 0.5 * viewport.width) + (uiOffset.x || 0),
    y: ((1 - ndc.y) * 0.5 * viewport.height) + (uiOffset.y || 0)
  });
}

export function createSiteReturnSnapshot({ activeView, siteWorldMode, mappingMode, camera, orbitTarget, environmentLightingMode, markerVisibility }) {
  if (!camera?.isPerspectiveCamera || !orbitTarget?.isVector3) throw new TypeError('Runtime camera and orbit target are required.');
  return Object.freeze({
    viewMode: activeView,
    siteWorldMode,
    mappingMode,
    camera: Object.freeze({
      position: Object.freeze(camera.position.toArray()),
      quaternion: Object.freeze(camera.quaternion.toArray()),
      fov: camera.fov,
      aspect: camera.aspect,
      near: camera.near,
      far: camera.far,
      zoom: camera.zoom,
      up: Object.freeze(camera.up.toArray())
    }),
    orbitControls: Object.freeze({ target: Object.freeze(orbitTarget.toArray()) }),
    environmentLightingMode,
    markerVisibility: Boolean(markerVisibility)
  });
}

export function restoreCameraFromSiteSnapshot(snapshot, camera, orbitTarget) {
  if (!snapshot?.camera || !camera?.isPerspectiveCamera || !orbitTarget?.isVector3) {
    throw new TypeError('A complete SiteReturnSnapshot and runtime camera are required.');
  }
  camera.position.fromArray(snapshot.camera.position);
  camera.quaternion.fromArray(snapshot.camera.quaternion);
  camera.fov = snapshot.camera.fov;
  camera.aspect = snapshot.camera.aspect;
  camera.near = snapshot.camera.near;
  camera.far = snapshot.camera.far;
  camera.zoom = snapshot.camera.zoom;
  camera.up.fromArray(snapshot.camera.up);
  orbitTarget.fromArray(snapshot.orbitControls.target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}

export class LatestWinsLocationNavigation {
  constructor({ validate, captureSite, activatePhoto, commitPhoto, restoreSite, capturePhoto, restorePhoto }) {
    for (const [name, callback] of Object.entries({ validate, captureSite, activatePhoto, commitPhoto, restoreSite })) {
      if (typeof callback !== 'function') throw new TypeError(`Location navigation requires ${name}.`);
    }
    this.validate = validate;
    this.captureSite = captureSite;
    this.activatePhoto = activatePhoto;
    this.commitPhoto = commitPhoto;
    this.restoreSite = restoreSite;
    this.capturePhoto = typeof capturePhoto === 'function' ? capturePhoto : () => null;
    this.restorePhoto = typeof restorePhoto === 'function' ? restorePhoto : async () => {};
    this.requestToken = 0;
    this.siteSnapshot = null;
  }

  cancelPending() {
    this.requestToken += 1;
  }

  async activate(record) {
    const target = this.validate(record);
    if (!this.siteSnapshot) this.siteSnapshot = this.captureSite();
    const token = ++this.requestToken;
    let result;
    try {
      result = await this.activatePhoto(record, target, token);
    } catch (error) {
      result = { status: 'UNAVAILABLE', error };
    }
    if (token !== this.requestToken) return Object.freeze({ status: 'STALE', token, record });
    if (result?.status !== 'READY') {
      const snapshot = this.siteSnapshot;
      try {
        await this.restoreSite(snapshot);
        this.siteSnapshot = null;
        return Object.freeze({ status: 'UNAVAILABLE', token, record, photoResult: result });
      } catch (error) {
        return Object.freeze({ status: 'ROLLBACK_FAILED', token, record, photoResult: result, error });
      }
    }
    try {
      await this.commitPhoto(record, target, token);
    } catch (error) {
      const snapshot = this.siteSnapshot;
      try {
        await this.restoreSite(snapshot);
        this.siteSnapshot = null;
        return Object.freeze({ status: 'UNAVAILABLE', token, record, photoResult: result, error });
      } catch (rollbackError) {
        return Object.freeze({ status: 'ROLLBACK_FAILED', token, record, photoResult: result, error, rollbackError });
      }
    }
    if (token !== this.requestToken) return Object.freeze({ status: 'STALE', token, record });
    return Object.freeze({ status: 'READY', token, record, photoResult: result });
  }

  async returnToSite() {
    if (!this.siteSnapshot) return Object.freeze({ status: 'NO_SNAPSHOT' });
    const token = ++this.requestToken;
    const photoSnapshot = this.capturePhoto();
    try {
      await this.restoreSite(this.siteSnapshot);
      if (token !== this.requestToken) return Object.freeze({ status: 'STALE', token });
      this.siteSnapshot = null;
      return Object.freeze({ status: 'RETURNED', token });
    } catch (error) {
      await this.restorePhoto(photoSnapshot);
      return Object.freeze({ status: 'RETURN_FAILED', token, error });
    }
  }
}
