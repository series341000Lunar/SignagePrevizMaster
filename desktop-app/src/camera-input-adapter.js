import * as THREE from 'three';

export const CAMERA_INPUT_MODES = Object.freeze({
  THREE_DIRECT: 'THREE_DIRECT',
  MAX_LIKE: 'MAX_LIKE'
});

export const MAX_LIKE_ADAPTER_STATUS = 'CANDIDATE_USER_CALIBRATION_OPEN';

function number(value, label) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new RangeError(`${label} must be a finite number.`);
  return parsed;
}

function point(value, label) {
  if (!value || typeof value !== 'object') throw new TypeError(`${label} is required.`);
  return {
    x: number(value.x, `${label}.x`),
    y: number(value.y, `${label}.y`),
    z: number(value.z, `${label}.z`)
  };
}

function fov(value, label = 'FOV') {
  const parsed = number(value, label);
  if (!(parsed > 0 && parsed < 180)) throw new RangeError(`${label} must be greater than 0 and less than 180 degrees.`);
  return parsed;
}

function aspect(value) {
  const parsed = number(value, 'Aspect');
  if (!(parsed > 0)) throw new RangeError('Aspect must be greater than 0.');
  return parsed;
}

export function cloneCameraValues(values) {
  return structuredClone(values);
}

export function maxLikePointToThree(value) {
  const source = point(value, 'Max-like point');
  return { x: source.x, y: source.z, z: -source.y };
}

export function threePointToMaxLike(value) {
  const source = point(value, 'Three point');
  return { x: source.x, y: -source.z, z: source.y };
}

export function horizontalToVerticalFov(horizontalDegrees, frameAspect) {
  const horizontal = THREE.MathUtils.degToRad(fov(horizontalDegrees, 'Horizontal FOV'));
  const vertical = 2 * Math.atan(Math.tan(horizontal / 2) / aspect(frameAspect));
  return THREE.MathUtils.radToDeg(vertical);
}

export function verticalToHorizontalFov(verticalDegrees, frameAspect) {
  const vertical = THREE.MathUtils.degToRad(fov(verticalDegrees, 'Vertical FOV'));
  const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * aspect(frameAspect));
  return THREE.MathUtils.radToDeg(horizontal);
}

export function validateCanonicalCameraValues(values) {
  if (!values || typeof values !== 'object') throw new TypeError('Camera values are required.');
  const position = point(values.position, 'Position');
  const orientation = point(values.orientation, 'Euler rotation');
  return {
    ...cloneCameraValues(values),
    position,
    orientation: {
      type: 'EULER_XYZ_DEGREES',
      ...orientation
    },
    fov: fov(values.fov),
    aspect: aspect(values.aspect),
    near: number(values.near, 'Near plane'),
    far: number(values.far, 'Far plane')
  };
}

export function createThreeDirectCandidate(baseValues, input) {
  const candidate = cloneCameraValues(baseValues);
  candidate.coordinateSpace = 'THREE_WORLD';
  candidate.position = point(input.position, 'Position');
  candidate.target = null;
  candidate.orientation = {
    type: 'EULER_XYZ_DEGREES',
    ...point(input.eulerXyzDegrees, 'Euler rotation')
  };
  candidate.fov = fov(input.fov);
  candidate.fovBasis = 'VERTICAL_THREE';
  return validateCanonicalCameraValues(candidate);
}

export function createMaxLikeCandidate(baseValues, input) {
  const maxPosition = point(input.position, 'Max-like position');
  const maxTarget = point(input.target, 'Max-like target');
  const threePosition = maxLikePointToThree(maxPosition);
  const threeTarget = maxLikePointToThree(maxTarget);
  const direction = new THREE.Vector3(
    threeTarget.x - threePosition.x,
    threeTarget.y - threePosition.y,
    threeTarget.z - threePosition.z
  );
  if (direction.lengthSq() <= Number.EPSILON) throw new RangeError('Max-like Position and Target must be different points.');

  const basis = String(input.fovBasis || '').toUpperCase();
  if (!['VERTICAL', 'HORIZONTAL'].includes(basis)) {
    throw new RangeError('Max-like FOV basis must be VERTICAL or HORIZONTAL.');
  }
  const inputFov = fov(input.fov);
  const verticalFov = basis === 'VERTICAL'
    ? inputFov
    : horizontalToVerticalFov(inputFov, baseValues.aspect);

  const probe = new THREE.PerspectiveCamera(verticalFov, baseValues.aspect, baseValues.near, baseValues.far);
  probe.position.set(threePosition.x, threePosition.y, threePosition.z);
  probe.rotation.order = 'XYZ';
  probe.lookAt(threeTarget.x, threeTarget.y, threeTarget.z);

  const candidate = cloneCameraValues(baseValues);
  candidate.coordinateSpace = 'THREE_WORLD';
  candidate.position = threePosition;
  candidate.target = null;
  candidate.orientation = {
    type: 'EULER_XYZ_DEGREES',
    x: THREE.MathUtils.radToDeg(probe.rotation.x),
    y: THREE.MathUtils.radToDeg(probe.rotation.y),
    z: THREE.MathUtils.radToDeg(probe.rotation.z)
  };
  candidate.fov = verticalFov;
  candidate.fovBasis = 'VERTICAL_THREE';

  return {
    cameraValues: validateCanonicalCameraValues(candidate),
    runtimeTarget: threeTarget,
    lastInput: {
      mode: CAMERA_INPUT_MODES.MAX_LIKE,
      adapterStatus: MAX_LIKE_ADAPTER_STATUS,
      position: maxPosition,
      target: maxTarget,
      fov: inputFov,
      fovBasis: basis
    }
  };
}

export function commitCameraRecordTransaction({ record, nextValues, applyRuntime, restoreRuntime }) {
  if (!record || !record.currentValues || !record.legacyValues) throw new TypeError('Editable CameraRecord is required.');
  if (typeof applyRuntime !== 'function') throw new TypeError('applyRuntime must be a function.');
  const previousValues = cloneCameraValues(record.currentValues);
  const validated = validateCanonicalCameraValues(nextValues);
  try {
    applyRuntime(validated);
    record.currentValues = cloneCameraValues(validated);
    return record.currentValues;
  } catch (error) {
    record.currentValues = previousValues;
    if (typeof restoreRuntime === 'function') restoreRuntime();
    throw error;
  }
}
