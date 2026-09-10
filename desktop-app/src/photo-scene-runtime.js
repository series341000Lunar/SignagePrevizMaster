export const PHOTO_CONTENT_ASPECT = 3 / 2;

export function computeContainedAspectRect(hostWidth, hostHeight, aspect = PHOTO_CONTENT_ASPECT) {
  if (![hostWidth, hostHeight, aspect].every((value) => Number.isFinite(value) && value > 0)) {
    throw new RangeError('Host dimensions and content aspect must be finite positive numbers.');
  }
  const hostAspect = hostWidth / hostHeight;
  const width = hostAspect > aspect ? hostHeight * aspect : hostWidth;
  const height = hostAspect > aspect ? hostHeight : hostWidth / aspect;
  return Object.freeze({
    x: (hostWidth - width) / 2,
    y: (hostHeight - height) / 2,
    width,
    height,
    aspect
  });
}

export function clientPointToContentNdc(clientX, clientY, canvasBounds, contentRect) {
  if (!canvasBounds || !contentRect) return null;
  const localX = clientX - canvasBounds.left;
  const localY = clientY - canvasBounds.top;
  const right = contentRect.x + contentRect.width;
  const bottom = contentRect.y + contentRect.height;
  if (localX < contentRect.x || localX > right || localY < contentRect.y || localY > bottom) return null;
  return Object.freeze({
    x: ((localX - contentRect.x) / contentRect.width) * 2 - 1,
    y: -((localY - contentRect.y) / contentRect.height) * 2 + 1
  });
}

function disposeResource(resource) {
  if (typeof resource?.dispose === 'function') resource.dispose();
}

export class LatestWinsPhotoSceneController {
  constructor({ load, validate, commit, clear, fail }) {
    if (typeof load !== 'function' || typeof commit !== 'function' || typeof clear !== 'function') {
      throw new TypeError('Photo controller requires load, commit, and clear callbacks.');
    }
    this.load = load;
    this.validate = typeof validate === 'function' ? validate : () => {};
    this.commit = commit;
    this.clear = clear;
    this.fail = typeof fail === 'function' ? fail : () => {};
    this.requestToken = 0;
    this.active = null;
  }

  releaseActive(reason = 'release') {
    const previous = this.active;
    this.active = null;
    if (previous) disposeResource(previous.resource);
    this.clear({ reason, previousRecord: previous?.record ?? null });
  }

  cancel(reason = 'cancel') {
    this.requestToken += 1;
    this.releaseActive(reason);
  }

  async activate(record) {
    const token = ++this.requestToken;
    this.releaseActive('scene-change');
    let resource = null;
    try {
      resource = await this.load(record, token);
      this.validate(record, resource);
      if (token !== this.requestToken) {
        disposeResource(resource);
        return Object.freeze({ status: 'STALE', token, record });
      }
      this.active = { record, resource, token };
      this.commit({ record, resource, token });
      return Object.freeze({ status: 'READY', token, record });
    } catch (error) {
      if (token !== this.requestToken) {
        disposeResource(resource);
        return Object.freeze({ status: 'STALE', token, record, error });
      }
      disposeResource(resource);
      this.active = null;
      this.clear({ reason: 'load-failure', previousRecord: record });
      this.fail({ record, error, token });
      return Object.freeze({ status: 'UNAVAILABLE', token, record, error });
    }
  }
}
