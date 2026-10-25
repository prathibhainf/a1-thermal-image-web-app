const fileInput = document.querySelector('#file-input');
const dropzone = document.querySelector('#dropzone');
const imagePreview = document.querySelector('#image-preview');
const tiffPreview = document.querySelector('#tiff-preview');
const emptyState = document.querySelector('#empty-state');
const metadataList = document.querySelector('#metadata-list');
const metadataEmpty = document.querySelector('#metadata-empty');
const mapEmpty = document.querySelector('#map-empty');
const mapCaption = document.querySelector('#map-caption-text');
let previewUrl = null;
let imageMap;
let marker;

function initializeMap() {
  if (!window.L || imageMap) return;
  imageMap = L.map('map', { zoomControl: true, scrollWheelZoom: false }).setView([20, 0], 2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(imageMap);
}

function readableSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function displayValue(value) {
  if (value instanceof Date) return value.toLocaleString();
  if (Array.isArray(value)) return value.slice(0, 12).map(displayValue).join(', ');
  if (value && typeof value === 'object') return '[structured data]';
  if (typeof value === 'number' && !Number.isInteger(value)) return value.toFixed(6);
  return String(value);
}

function findTag(tags, name) {
  const wanted = name.toLowerCase();
  const entry = Object.entries(tags).find(([key]) => key.toLowerCase().replace(/[^a-z]/g, '').endsWith(wanted));
  return entry?.[1];
}

function coordinate(value, reference) {
  if (value == null) return null;
  let result;
  if (Array.isArray(value)) {
    const parts = value.map(Number);
    if (parts.length >= 3) result = parts[0] + parts[1] / 60 + parts[2] / 3600;
    else return null;
  } else {
    result = Number(value);
    if (!Number.isFinite(result)) return null;
  }
  if (typeof value !== 'number' && typeof reference === 'string' && /^[SW]$/i.test(reference)) result *= -1;
  return Number.isFinite(result) ? result : null;
}

function showLocation(tags) {
  const latitude = coordinate(findTag(tags, 'gpslatitude'), findTag(tags, 'gpslatituderef'));
  const longitude = coordinate(findTag(tags, 'gpslongitude'), findTag(tags, 'gpslongituderef'));
  const altitude = findTag(tags, 'gpsaltitude');
  const summary = document.querySelector('#position-status');
  const coordinates = document.querySelector('#position-coords');
  const mapLink = document.querySelector('#external-map');

  if (latitude === null || longitude === null || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    summary.textContent = 'No coordinates found';
    coordinates.textContent = 'GPS data will appear here';
    mapLink.hidden = true;
    mapEmpty.hidden = false;
    mapCaption.textContent = 'No position attached to this image';
    if (marker) marker.remove();
    return;
  }

  const latLng = [latitude, longitude];
  const coordinateText = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
  summary.textContent = 'GPS position detected';
  coordinates.textContent = coordinateText;
  mapCaption.textContent = altitude == null ? coordinateText : `${coordinateText} · ${displayValue(altitude)} m altitude`;
  mapLink.href = `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`;
  mapLink.hidden = false;
  mapEmpty.hidden = true;

  initializeMap();
  if (imageMap) {
    if (marker) marker.remove();
    marker = L.marker(latLng, {
      icon: L.divIcon({ className: '', html: '<span class="map-marker"></span>', iconSize: [16, 16], iconAnchor: [8, 8] })
    }).addTo(imageMap);
    imageMap.setView(latLng, 15);
    window.setTimeout(() => imageMap.invalidateSize(), 50);
  }
}

function displayMetadata(tags) {
  metadataList.replaceChildren();
  const entries = Object.entries(tags)
    .filter(([key, value]) => !key.startsWith('_') && value != null && typeof value !== 'function')
    .filter(([, value]) => !(value instanceof ArrayBuffer) && !ArrayBuffer.isView(value))
    .slice(0, 100);

  document.querySelector('#metadata-count').textContent = `${entries.length} FIELD${entries.length === 1 ? '' : 'S'}`;
  metadataEmpty.hidden = entries.length > 0;
  for (const [key, value] of entries) {
    const row = document.createElement('div');
    row.className = 'metadata-row';
    const term = document.createElement('dt');
    const description = document.createElement('dd');
    term.textContent = key;
    description.textContent = displayValue(value);
    row.append(term, description);
    metadataList.append(row);
  }

  const temperatureFields = entries.filter(([key]) => /radiometric|temperature|objecttemp|ambienttemp|emissivity/i.test(key));
  if (temperatureFields.length) {
    metadataEmpty.textContent = 'Radiometric or temperature-related fields were detected; values depend on the camera format.';
    if (entries.length) metadataEmpty.hidden = true;
  } else {
    metadataEmpty.textContent = entries.length ? 'No radiometric temperature fields detected in this file.' : 'No readable EXIF/XMP metadata found in this file.';
    if (entries.length) {
      const note = document.createElement('div');
      note.className = 'metadata-empty';
      note.textContent = 'No radiometric temperature fields detected in this file.';
      metadataList.append(note);
    }
  }
}

async function previewFile(file) {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(file);
  imagePreview.hidden = true;
  tiffPreview.hidden = true;
  emptyState.hidden = true;

  const isTiff = /\.tiff?$/i.test(file.name) || /image\/tiff/i.test(file.type);
  if (isTiff && window.UTIF) {
    try {
      const buffer = await file.arrayBuffer();
      const image = UTIF.decode(buffer)[0];
      UTIF.decodeImage(buffer, image);
      const rgba = UTIF.toRGBA8(image);
      tiffPreview.width = image.width;
      tiffPreview.height = image.height;
      tiffPreview.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba), image.width, image.height), 0, 0);
      tiffPreview.hidden = false;
      document.querySelector('#image-dimensions').textContent = `${image.width} × ${image.height} PX`;
    } catch {
      emptyState.hidden = false;
      emptyState.querySelector('strong').textContent = 'TIFF preview could not be decoded';
      emptyState.querySelector('span:not(.crosshair span)').textContent = 'Metadata inspection may still be available';
    }
  } else {
    imagePreview.onload = () => {
      document.querySelector('#image-dimensions').textContent = `${imagePreview.naturalWidth} × ${imagePreview.naturalHeight} PX`;
    };
    imagePreview.onerror = () => {
      emptyState.hidden = false;
      emptyState.querySelector('strong').textContent = 'This image cannot be previewed here';
    };
    imagePreview.src = previewUrl;
    imagePreview.hidden = false;
  }

  document.querySelector('#file-name').textContent = file.name;
  document.querySelector('#file-size').textContent = readableSize(file.size);
  document.querySelector('#file-summary').hidden = false;
  document.querySelector('#preview-label').textContent = file.name.toUpperCase();

  try {
    if (!window.exifr) throw new Error('Metadata reader did not load. Check your internet connection and reload the page.');
    const tags = await window.exifr.parse(file, {
      tiff: true, exif: true, gps: true, xmp: true, iptc: true,
      mergeOutput: true, translateValues: true
    }) || {};
    displayMetadata(tags);
    showLocation(tags);
  } catch (error) {
    displayMetadata({});
    metadataEmpty.hidden = false;
    metadataEmpty.textContent = error.message || 'Could not read metadata from this image.';
    showLocation({});
  }
}

function clearImage() {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  imagePreview.removeAttribute('src');
  imagePreview.hidden = true;
  tiffPreview.hidden = true;
  emptyState.hidden = false;
  emptyState.querySelector('strong').textContent = 'Your image will appear here';
  emptyState.querySelector('span:not(.crosshair span)').textContent = 'Choose a drone image to begin inspection';
  document.querySelector('#file-summary').hidden = true;
  document.querySelector('#image-dimensions').textContent = 'AWAITING IMAGE';
  document.querySelector('#preview-label').textContent = 'IMAGE PREVIEW';
  metadataList.replaceChildren();
  document.querySelector('#metadata-count').textContent = '0 FIELDS';
  metadataEmpty.textContent = 'Image metadata will be listed here after selection.';
  metadataEmpty.hidden = false;
  showLocation({});
  fileInput.value = '';
}

function acceptFiles(files) {
  const file = files?.[0];
  if (!file) return;
  const supported = /\.(jpe?g|png|tiff?)$/i.test(file.name) || /image\/(jpeg|png|tiff)/i.test(file.type);
  if (!supported) {
    window.alert('Choose a JPEG, TIFF, or PNG image.');
    return;
  }
  previewFile(file);
}

dropzone.addEventListener('click', () => fileInput.click());
document.querySelector('#open-file').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', event => acceptFiles(event.target.files));
document.querySelector('#clear-file').addEventListener('click', clearImage);
for (const eventName of ['dragenter', 'dragover']) {
  dropzone.addEventListener(eventName, event => {
    event.preventDefault();
    dropzone.classList.add('drag-over');
  });
}
for (const eventName of ['dragleave', 'drop']) {
  dropzone.addEventListener(eventName, event => {
    event.preventDefault();
    dropzone.classList.remove('drag-over');
  });
}
dropzone.addEventListener('drop', event => acceptFiles(event.dataTransfer.files));

initializeMap();
