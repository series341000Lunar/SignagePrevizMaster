import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AUTHORING_BLEND_MODE,
  AUTHORING_COORDINATE_SPACE,
  AuthoringPointerSession,
  DEFAULT_AUTHORING_TRANSFORM,
  LayoutCameraInterlock,
  ScreenImageAuthoringSession,
  computeNormalizedImageSize,
  detectEmbeddedAlpha,
  isSupportedImageFile,
  screenPointToSourceUv,
  transformToViewportRect
} from '../src/screen-image-authoring.js';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rendererSource = await readFile(path.join(appRoot, 'src', 'renderer.js'), 'utf8');
const runtimeSource = await readFile(path.join(appRoot, 'src', 'projection-bake-runtime.js'), 'utf8');
const htmlSource = await readFile(path.join(appRoot, 'src', 'index.html'), 'utf8');

assert.equal(AUTHORING_COORDINATE_SPACE, 'PROJECTION_FRAME_NORMALIZED_TOP_LEFT');
assert.equal(AUTHORING_BLEND_MODE, 'NORMAL');
assert.equal(isSupportedImageFile({ name: 'alpha.PNG', type: 'image/png' }), true);
assert.equal(isSupportedImageFile({ name: 'photo.jpg', type: 'image/jpeg' }), true);
assert.equal(isSupportedImageFile({ name: 'photo.JPEG' }), true);
assert.equal(isSupportedImageFile({ name: 'animation.gif', type: 'image/gif' }), false);

const rgbaPng = new Uint8Array(33);
rgbaPng.set([137, 80, 78, 71, 13, 10, 26, 10]);
rgbaPng[25] = 6;
assert.equal(detectEmbeddedAlpha(rgbaPng, 'image/png'), true);
const rgbPng = rgbaPng.slice();
rgbPng[25] = 2;
assert.equal(detectEmbeddedAlpha(rgbPng, 'image/png'), false);
const palettePng = new Uint8Array(46);
palettePng.set([137, 80, 78, 71, 13, 10, 26, 10]);
palettePng.set([0, 0, 0, 13, 73, 72, 68, 82], 8);
palettePng[25] = 3;
palettePng.set([0, 0, 0, 1, 116, 82, 78, 83], 33);
assert.equal(detectEmbeddedAlpha(palettePng, 'image/png'), true);
assert.equal(detectEmbeddedAlpha(rgbaPng, 'image/jpeg'), false);

const source = { id: 'source-1', filename: 'source.png', type: 'image/png', mimeType: 'image/png', width: 3000, height: 3840, hasAlpha: true, byteLength: 12345 };
const session = new ScreenImageAuthoringSession();
session.setSource(source, 'ANAMORPHIC_FRONT_75F');
assert.deepEqual({ width: session.source.width, height: session.source.height, hasAlpha: session.source.hasAlpha }, { width: 3000, height: 3840, hasAlpha: true });
assert.equal(session.status, 'DIRTY / NEEDS BAKE');
session.markBaked();
assert.equal(session.status, 'READY');
assert.equal(session.setTransform({ x: 0.63, y: 0.42 }), true);
assert.equal(session.setTransform({ scale: 1.4 }), true);
assert.equal(session.setTransform({ rotationDegrees: -30 }), true);
assert.deepEqual(session.transform, { x: 0.63, y: 0.42, scale: 1.4, rotationDegrees: 330 });
assert.equal(session.status, 'DIRTY / NEEDS BAKE');
assert.equal(session.bindFamily('ANAMORPHIC_BACK'), true);
assert.equal(session.familyId, 'ANAMORPHIC_BACK');
assert.equal(session.resetTransform(), true);
assert.deepEqual(session.transform, DEFAULT_AUTHORING_TRANSFORM);

const frameAspect = 3000 / 3840;
const normalizedSize = computeNormalizedImageSize({ sourceWidth: 3000, sourceHeight: 3840, frameAspect, scale: 1 });
assert.equal(normalizedSize.width, 0.75);
assert.equal(normalizedSize.height, 0.75);
const centerUv = screenPointToSourceUv({ x: 0.5, y: 0.5 }, source, frameAspect, DEFAULT_AUTHORING_TRANSFORM);
assert.deepEqual(centerUv, { u: 0.5, v: 0.5, inside: true });
assert.equal(screenPointToSourceUv({ x: 1, y: 1 }, source, frameAspect, DEFAULT_AUTHORING_TRANSFORM).inside, false);
const small = transformToViewportRect({ x: 0.6, y: 0.4, scale: 1.2, rotationDegrees: 15 }, source, frameAspect, { x: 0, y: 0, width: 800, height: 1024 });
const large = transformToViewportRect({ x: 0.6, y: 0.4, scale: 1.2, rotationDegrees: 15 }, source, frameAspect, { x: 0, y: 0, width: 1600, height: 2048 });
assert.equal(small.centerX / 800, large.centerX / 1600);
assert.equal(small.centerY / 1024, large.centerY / 2048);
assert.equal(small.width / 800, large.width / 1600);
assert.equal(small.height / 1024, large.height / 2048);

const interlock = new LayoutCameraInterlock(false);
assert.equal(interlock.controlsEnabled, true);
assert.equal(interlock.requestManualLock(true), true);
assert.equal(interlock.controlsEnabled, false);
assert.equal(interlock.requestManualLock(false), true);
assert.equal(interlock.enterLayout(), true);
assert.equal(interlock.forcedLocked, true);
assert.equal(interlock.requestManualLock(false), false);
assert.equal(interlock.exitLayout(), true);
assert.equal(interlock.manualLocked, false);
interlock.requestManualLock(true);
interlock.enterLayout();
interlock.exitLayout();
assert.equal(interlock.manualLocked, true);

const pointer = new AuthoringPointerSession();
assert.equal(pointer.begin('move', 10, { x: 0.2, y: 0.3 }, DEFAULT_AUTHORING_TRANSFORM), true);
assert.equal(pointer.end(11), false);
assert.equal(pointer.end(10), true);
assert.equal(pointer.begin('scale', 12, { x: 0.8, y: 0.8 }, DEFAULT_AUTHORING_TRANSFORM), true);
assert.equal(pointer.cancel(), true);
assert.equal(pointer.begin('rotate', 13, { x: 0.5, y: 0.1 }, DEFAULT_AUTHORING_TRANSFORM), true);
assert.equal(pointer.cancel(), true);

assert.match(runtimeSource, /new THREE\.Texture\(authoringSource\.image\)/);
assert.match(runtimeSource, /ORIGINAL_FILE_BITMAP_DIRECT_TEXTURE_SAMPLE/);
assert.match(runtimeSource, /authoringEnabled/);
assert.match(runtimeSource, /gl_FragColor = vec4\(source\.rgb, source\.a \* maskWeight\)/);
assert.match(rendererSource, /authoringTechnicalThresholds = authoringSource \? \{/);
assert.match(rendererSource, /ROTATED_STRAIGHT_ALPHA_LINEAR_RESAMPLE_EDGE_TOLERANCE/);
assert.match(rendererSource, /setPointerCapture\(event\.pointerId\)/);
assert.match(rendererSource, /event\.preventDefault\(\)/);
assert.match(rendererSource, /event\.stopPropagation\(\)/);
assert.match(rendererSource, /window\.addEventListener\('blur', cancelAuthoringPointerInteraction\)/);
assert.match(rendererSource, /siteAnamorphicFamilySelect\.disabled = !familyContext \|\| authoringCameraInterlock\.layoutEditing \|\| authoringPointerSession\.active/);
assert.match(rendererSource, /controlsSite\.enabled =[\s\S]*!authoringLocked/);
assert.match(rendererSource, /window\.runBlock8AInterlockSmoke/);
assert.match(rendererSource, /window\.runBlock8AAuthoringBakeSmoke/);
assert.match(htmlSource, /id="authoring-image-input"[^>]*accept="image\/png,image\/jpeg,.png,.jpg,.jpeg"/);
assert.match(htmlSource, /id="authoring-camera-lock"[\s\S]*<svg/);
assert.match(htmlSource, /id="layout-edit-button"/);

console.log(JSON.stringify({
  block: '8A',
  technicalPass: true,
  userValidation: 'PASS_CLOSED',
  sourceFormats: ['PNG', 'JPG', 'JPEG'],
  alphaPreserved: true,
  originalDimensionsPreserved: true,
  coordinateSpace: AUTHORING_COORDINATE_SPACE,
  operations: ['MOVE', 'UNIFORM_SCALE', 'ROTATION', 'RESET'],
  cameraInterlock: 'PASS',
  viewportInvariant: true,
  productionSampling: 'ORIGINAL_FILE_BITMAP_DIRECT_TEXTURE_SAMPLE'
}, null, 2));
