# Thermal Field Image Inspector

- This is a static browser app; `index.html` is the entry point. Keep setup simple and avoid adding a build system unless requested.
- Keep selected image data local to the browser. Do not upload images or metadata.
- Metadata fields vary by drone and export format. Never imply that ordinary thermal pixels contain calibrated temperature readings.
- GPS should only be shown when valid coordinates are embedded in the image. Use OpenStreetMap for map display and links.
- Preserve responsive behavior and existing visual styling when changing the interface.
- External libraries and map tiles require an internet connection. Document any new runtime requirements in `README.md`.
- Validate changes by opening `index.html` in a browser and exercising image selection, metadata display, map location, and reset behavior.
