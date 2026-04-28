const API_URLS = {
    'alfa-layer': "https://geoserver.mapid.io/layers_new/get_layer?api_key=aa2a63293234466f9652198c7e144b12&layer_id=69ef82ea14459ece78c68c7d&project_id=698961bf2d33abfe6443f6ea",
    'indo-layer': "https://geoserver.mapid.io/layers_new/get_layer?api_key=aa2a63293234466f9652198c7e144b12&layer_id=69ef82f614459ece78c68ed8&project_id=698961bf2d33abfe6443f6ea",
    'borma-layer': "https://geoserver.mapid.io/layers_new/get_layer?api_key=aa2a63293234466f9652198c7e144b12&layer_id=69ef880e14459ece78c6919b&project_id=698961bf2d33abfe6443f6ea",
    'ck-layer': "https://geoserver.mapid.io/layers_new/get_layer?api_key=aa2a63293234466f9652198c7e144b12&layer_id=69ef881414459ece78c69379&project_id=698961bf2d33abfe6443f6ea",
    'griya-layer': "https://geoserver.mapid.io/layers_new/get_layer?api_key=aa2a63293234466f9652198c7e144b12&layer_id=69ef97ea14459ece78c69e36&project_id=698961bf2d33abfe6443f6ea"
};

const LOGOS = {
    'alfa': 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/86/Alfamart_logo.svg/512px-Alfamart_logo.svg.png',
    'indo': 'https://upload.wikimedia.org/wikipedia/id/thumb/0/04/Logo_Indomaret.svg/512px-Logo_Indomaret.svg.png',
    'borma': 'https://cdn-icons-png.flaticon.com/512/3737/3737372.png',
    'ck': 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/Circle_K_logo.svg/512px-Circle_K_logo.svg.png',
    'griya': 'https://cdn-icons-png.flaticon.com/512/3081/3081840.png'
};

// --- STATE MANAGEMENT ---
let storeData = {};
let activeLayersList = ['alfa-layer', 'indo-layer', 'borma-layer', 'ck-layer', 'griya-layer'];
let brandInfo = {
    'alfa-layer': { name: 'Alfa', color: '#ef4444' },
    'indo-layer': { name: 'Indo', color: '#3b82f6' },
    'borma-layer': { name: 'Borma', color: '#f59e0b' },
    'ck-layer': { name: 'Circle K', color: '#f97316' },
    'griya-layer': { name: 'Griya', color: '#a855f7' }
};

// State untuk fitur Klik dan Cancel Radius/Popup
let activePopup = null;
let activePointCoords = null; 

// --- INIT MAP ---
const map = new maplibregl.Map({
    container: 'map',
    style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json', 
    center: [107.6191, -6.9175], 
    zoom: 12
});

// --- FUNGSI GENERATOR RADIUS (500 METER) ---
function createCirclePolygon(center, radiusInKm) {
    const coords = { latitude: center[1], longitude: center[0] };
    const km = radiusInKm;
    const ret = [];
    const distanceX = km / (111.32 * Math.cos((coords.latitude * Math.PI) / 180));
    const distanceY = km / 110.574;

    for (let i = 0; i < 64; i++) {
        const theta = (i / 64) * (2 * Math.PI);
        const x = distanceX * Math.cos(theta);
        const y = distanceY * Math.sin(theta);
        ret.push([coords.longitude + x, coords.latitude + y]);
    }
    ret.push(ret[0]);
    return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [ret] } };
}

function showRadius(center, color) {
    const geojson = { type: 'FeatureCollection', features: [createCirclePolygon(center, 0.5)] }; 
    if (map.getSource('radius-source')) {
        map.getSource('radius-source').setData(geojson);
        map.setPaintProperty('radius-layer', 'fill-color', color);
    }
}

// Fungsi untuk menghilangkan radius dan popup
function clearActiveSelection() {
    if (activePopup) {
        activePopup.remove();
        activePopup = null;
    }
    if (map.getSource('radius-source')) {
        map.getSource('radius-source').setData({ type: 'FeatureCollection', features: [] });
    }
    document.getElementById('detail-content').innerHTML = `Klik titik pada peta untuk detail.`;
    activePointCoords = null;
}

// --- UI INTERACTIONS ---
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('active'); }

function toggleLayer(layerId) {
    if(!map.getLayer(layerId)) return;
    const vis = (map.getLayoutProperty(layerId, 'visibility') || 'visible') === 'visible' ? 'none' : 'visible';
    
    map.setLayoutProperty(layerId, 'visibility', vis);
    if(map.getLayer(layerId + '-logo')) map.setLayoutProperty(layerId + '-logo', 'visibility', vis);
    if(map.getLayer(layerId + '-clusters')) map.setLayoutProperty(layerId + '-clusters', 'visibility', vis);
    if(map.getLayer(layerId + '-cluster-count')) map.setLayoutProperty(layerId + '-cluster-count', 'visibility', vis);
    
    const heatLayer = layerId + '-heat';
    if(map.getLayer(heatLayer)) {
        const isHeatmapMode = document.getElementById('toggle-heat').checked;
        map.setLayoutProperty(heatLayer, 'visibility', (vis === 'visible' && isHeatmapMode) ? 'visible' : 'none');
    }
}

function toggleHeatmap() {
    const isHeatOn = document.getElementById('toggle-heat').checked;
    activeLayersList.forEach(baseId => {
        const heatId = baseId + '-heat';
        if (map.getLayer(heatId)) {
            const baseVis = map.getLayoutProperty(baseId, 'visibility') || 'visible';
            map.setLayoutProperty(heatId, 'visibility', (isHeatOn && baseVis === 'visible') ? 'visible' : 'none');
        }
    });
}

function openTable(layerId) {
    const modal = document.getElementById('table-modal');
    const tbody = document.getElementById('table-body');
    modal.style.display = 'block';
    tbody.innerHTML = "";
    
    let judulTabel = brandInfo[layerId] ? brandInfo[layerId].name.toUpperCase() : layerId.split('-')[0].toUpperCase();
    document.getElementById('modal-title').innerText = `Database: ${judulTabel}`;

    const data = storeData[layerId];
    if(!data || !data.features) return;

    data.features.forEach(f => {
        const p = f.properties;
        const c = f.geometry.coordinates;
        const name = p.NAMA || p.nama || p.Nama || p.name || p.Name || "Aset Retail";
        const district = p.KECAMATAN || p.kecamatan || p.Kecamatan || "-";
        const address = p.ALAMAT || p.alamat || p.Alamat || "-";
        const lng = p.LONGITUDE || c[0];
        const lat = p.LATITUDE || c[1];

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><b>${name}</b></td>
            <td>${district}</td>
            <td style="font-size: 0.75rem; max-width: 200px;">${address}</td>
            <td style="font-family: monospace;">${lng}</td>
            <td style="font-family: monospace;">${lat}</td>
            <td><button class="btn-fly" onclick="flyToStore(${c[0]}, ${c[1]})"><i class="fa-solid fa-paper-plane"></i> Fly</button></td>
        `;
        tbody.appendChild(tr);
    });

    if (window.innerWidth <= 768) { document.getElementById('sidebar').classList.remove('active'); }
}

function flyToStore(lng, lat) {
    map.flyTo({ center: [lng, lat], zoom: 17, speed: 1.2, essential: true });
    if (window.innerWidth <= 768) {
        document.getElementById('table-modal').style.display = 'none';
        document.getElementById('sidebar').classList.remove('active');
    }
}

function removeCustomLayer(layerId) {
    const isConfirm = confirm(`Yakin ingin menghapus layer ${brandInfo[layerId].name}?`);
    if(!isConfirm) return;

    const cardEl = document.getElementById('card-' + layerId);
    if(cardEl) cardEl.remove();

    if(map.getLayer(layerId)) map.removeLayer(layerId);
    if(map.getLayer(layerId + '-clusters')) map.removeLayer(layerId + '-clusters');
    if(map.getLayer(layerId + '-cluster-count')) map.removeLayer(layerId + '-cluster-count');
    if(map.getLayer(layerId + '-heat')) map.removeLayer(layerId + '-heat');
    if(map.getLayer(layerId + '-logo')) map.removeLayer(layerId + '-logo');
    if(map.getSource(layerId)) map.removeSource(layerId);

    delete storeData[layerId];
    delete brandInfo[layerId];
    activeLayersList = activeLayersList.filter(id => id !== layerId);
    document.getElementById('table-modal').style.display = 'none';
    
    clearActiveSelection(); // Hapus radius jika ada
}

// --- CORE MAPPING INJECTION (CLUSTER + RADIUS + POPUP) ---
function injectLayerToMap(layerId, data, color, logoKey) {
    if (!map.getSource(layerId)) {
        map.addSource(layerId, { type: 'geojson', data: data, cluster: true, clusterMaxZoom: 15, clusterRadius: 50 });
    }

    // --- LAYER HEATMAP, CLUSTER, DAN TITIK ---
    map.addLayer({
        id: layerId + '-heat', type: 'heatmap', source: layerId,
        layout: { 'visibility': document.getElementById('toggle-heat') && document.getElementById('toggle-heat').checked ? 'visible' : 'none' },
        paint: {
            'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 15, 3],
            'heatmap-color': [ 'interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(33,102,172,0)', 0.2, 'rgb(103,169,207)', 0.4, 'rgb(209,229,240)', 0.6, 'rgb(253,219,199)', 0.8, 'rgb(239,138,98)', 1, 'rgb(178,24,43)' ],
            'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 2, 9, 20, 15, 40],
            'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 7, 1, 18, 0]
        }
    });

    map.addLayer({
        id: layerId + '-clusters', type: 'circle', source: layerId, filter: ['has', 'point_count'],
        paint: { 'circle-radius': ['step', ['get', 'point_count'], 14, 20, 20, 50, 26], 'circle-color': color, 'circle-stroke-width': 2, 'circle-stroke-color': '#fff', 'circle-opacity': 0.8 }
    });
    
    map.addLayer({
        id: layerId + '-cluster-count', type: 'symbol', source: layerId, filter: ['has', 'point_count'],
        layout: { 'text-field': '{point_count_abbreviated}', 'text-size': 12 }, paint: { 'text-color': '#fff' }
    });

    map.addLayer({
        id: layerId, type: 'circle', source: layerId, filter: ['!', ['has', 'point_count']],
        paint: { 'circle-color': color, 'circle-radius': 6, 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' }
    });

    if(logoKey) {
        map.addLayer({
            id: layerId + '-logo', type: 'symbol', source: layerId, filter: ['!', ['has', 'point_count']],
            layout: { 'icon-image': 'logo-' + logoKey, 'icon-size': 0.03, 'icon-allow-overlap': true }
        });
    }

    // --- INTERAKSI KLIK ---
    map.on('click', layerId, (e) => {
        if (e.features[0].properties.cluster) return;
        if (isRadiusToolActive || isMeasureToolActive) return;

        const p = e.features[0].properties;
        const coords = e.features[0].geometry.coordinates;
        const coordsString = `${coords[0]},${coords[1]}`;

        // Jika klik titik yang sama, matikan semuanya
        if (activePointCoords === coordsString) {
            clearActiveSelection();
            if (map.getLayer('competitor-line')) map.setLayoutProperty('competitor-line', 'visibility', 'none');
            activePointCoords = null;
            return;
        }

        activePointCoords = coordsString;
        if (activePopup) activePopup.remove();

        // 1. Logika Radar Kompetitor Terdekat
        const nearestComp = findNearestCompetitor(coords, layerId);
        let competitorHTML = "";
        
        if (nearestComp.coords) {
            const status = getCompetitorStatus(nearestComp.dist);
            const distText = nearestComp.dist < 1 ? (nearestComp.dist * 1000).toFixed(0) + ' m' : nearestComp.dist.toFixed(2) + ' km';
            
            // Gambar garis merah putus-putus
            updateCompetitorLine(coords, nearestComp.coords);
            
            competitorHTML = `
                <hr style="margin:10px 0; border:0; border-top:1px solid #eee;">
                <div style="font-size:0.7rem; font-weight:bold; color:#64748b;">KOMPETITOR TERDEKAT:</div>
                <div style="font-size:0.8rem;">${nearestComp.name} (${distText})</div>
                <div class="status-badge ${status.class}">${status.label}</div>
            `;
        }

        // 2. Tampilkan Radius 500m
        showRadius(coords, color);

        // 3. Tampilkan Popup Gabungan
        const navUrl = `https://www.google.com/maps/search/?api=1&query=${coords[1]},${coords[0]}`;
        
        activePopup = new maplibregl.Popup({ className: 'modern-popup', offset: 10 })
            .setLngLat(coords)
            .setHTML(`
                <div class="popup-title">${p.NAMA || p.nama || "Retail"}</div>
                <div class="popup-address">${p.ALAMAT || p.alamat || "Alamat tidak tersedia"}</div>
                ${competitorHTML}
                <a href="${navUrl}" target="_blank" class="btn-nav" style="margin-top:10px; display:block; text-align:center;">
                    <i class="fa-solid fa-location-arrow"></i> Navigasi Ke Sini
                </a>
            `)
            .addTo(map);

        activePopup.on('close', () => {
            clearActiveSelection();
            if (map.getLayer('competitor-line')) map.setLayoutProperty('competitor-line', 'visibility', 'none');
        });

        document.getElementById('detail-content').innerHTML = `<b>${p.NAMA || "Retail"}</b><br><small>${p.ALAMAT || "-"}</small>`;
    });

    // Cursor Styling
    map.on('mouseenter', layerId, () => { if(!isRadiusToolActive && !isMeasureToolActive) map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', layerId, () => { if(!isRadiusToolActive && !isMeasureToolActive) map.getCanvas().style.cursor = ''; });
}

// --- FUNGSI TAMBAH LAYER API (USER INPUT) ---
async function addCustomLayer() {
    const customName = document.getElementById('custom-name').value;
    const customUrl = document.getElementById('custom-url').value;
    const customColor = document.getElementById('custom-color').value;

    if (!customName || !customUrl) {
        alert("Mohon isi Nama Data dan URL API terlebih dahulu.");
        return;
    }

    const btn = document.getElementById('btn-add-layer');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Memuat Data...';
    btn.disabled = true;

    try {
        const newLayerId = 'custom-' + Date.now() + '-layer';
        const res = await fetch(customUrl);
        const raw = await res.json();
        const data = raw.data && raw.data.features ? raw.data : raw;
        
        if (!data || !data.features) throw new Error("Format data bukan GeoJSON.");

        storeData[newLayerId] = data;
        activeLayersList.push(newLayerId);
        brandInfo[newLayerId] = { name: customName, color: customColor };

        injectLayerToMap(newLayerId, data, customColor, null);

        const cardContainer = document.getElementById('custom-layers-container');
        const newCard = document.createElement('div');
        newCard.className = 'brand-card custom'; 
        newCard.id = 'card-' + newLayerId;
        newCard.style.borderLeft = `4px solid ${customColor}`;
        newCard.innerHTML = `
            <div class="brand-header">
                <div class="brand-title"><i class="fa-solid fa-map-pin" style="color:${customColor}"></i> ${customName}</div>
                <div style="display:flex; align-items:center; gap:8px;">
                    <button onclick="removeCustomLayer('${newLayerId}')" class="btn-delete-layer" title="Hapus Layer"><i class="fa-solid fa-trash"></i></button>
                    <label class="switch"><input type="checkbox" checked onchange="toggleLayer('${newLayerId}')"><span class="slider"></span></label>
                </div>
            </div>
            <span class="stats-num">${data.features.length}</span> <span class="stats-label">titik distribusi</span>
            <button class="btn-action" onclick="openTable('${newLayerId}')"><i class="fa-solid fa-table-list"></i> Buka Tabel</button>
        `;
        cardContainer.appendChild(newCard);

        document.getElementById('custom-name').value = '';
        document.getElementById('custom-url').value = '';

    } catch (e) {
        alert("Gagal memuat API! Pastikan URL mengembalikan JSON/GeoJSON yang benar.");
        console.error(e);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// --- INIT DATA PADA SAAT APLIKASI DIMUAT ---
map.on('load', async () => {
    map.addSource('radius-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
        id: 'radius-layer', type: 'fill', source: 'radius-source',
        paint: { 'fill-color': '#10b981', 'fill-opacity': 0.2, 'fill-outline-color': '#10b981' }
    });

    for (const [key, url] of Object.entries(LOGOS)) {
        map.loadImage(url, (err, img) => { if(!err) map.addImage('logo-' + key, img); });
    }

    async function loadDefaultLayer(layerId, color, countId, logoKey) {
        try {
            const res = await fetch(API_URLS[layerId]);
            const raw = await res.json();
            const data = raw.data && raw.data.features ? raw.data : raw;
            storeData[layerId] = data;

            document.getElementById(countId).innerText = data.features.length;
            injectLayerToMap(layerId, data, color, logoKey);
            
        } catch (e) {
            document.getElementById(countId).innerText = "!";
        }
    }

    loadDefaultLayer('alfa-layer', '#ef4444', 'count-alfa', 'alfa');
    loadDefaultLayer('indo-layer', '#3b82f6', 'count-indo', 'indo');
    loadDefaultLayer('borma-layer', '#f59e0b', 'count-borma', 'borma');
    loadDefaultLayer('ck-layer', '#f97316', 'count-ck', 'ck');
    loadDefaultLayer('griya-layer', '#a855f7', 'count-griya', 'griya');

    map.addSource('measure-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    
    // Gaya untuk Garis
    map.addLayer({
        id: 'measure-lines', type: 'line', source: 'measure-source', filter: ['==', '$type', 'LineString'],
        paint: { 'line-color': '#f59e0b', 'line-width': 3, 'line-dasharray': [2, 2] } // Garis putus-putus
    });
    
    // Gaya untuk Titik Sudut
    map.addLayer({
        id: 'measure-points', type: 'circle', source: 'measure-source', filter: ['==', '$type', 'Point'],
        paint: { 'circle-color': '#f59e0b', 'circle-radius': 5, 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' }
    });
});

// --- FITUR PENCARIAN (SEARCH BAR) ---
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');

searchInput.addEventListener('input', function() {
    const query = this.value.toLowerCase();
    searchResults.innerHTML = '';
    
    if (query.length < 2) {
        searchResults.style.display = 'none';
        return;
    }

    let matches = [];

    for (const layerId in storeData) {
        const data = storeData[layerId];
        if (data && data.features) {
            data.features.forEach(f => {
                const p = f.properties;
                const c = f.geometry.coordinates;
                const name = p.NAMA || p.nama || p.Nama || p.name || "Aset Retail";
                const dist = p.KECAMATAN || p.kecamatan || p.Kecamatan || p.ALAMAT || p.alamat || "";
                
                if (name.toLowerCase().includes(query) || dist.toLowerCase().includes(query)) {
                    matches.push({
                        name: name, district: dist, coords: c, brand: brandInfo[layerId]
                    });
                }
            });
        }
    }

    if (matches.length > 0) {
        matches.slice(0, 10).forEach(match => {
            const li = document.createElement('li');
            li.innerHTML = `
                <span class="search-badge" style="background:${match.brand.color}">${match.brand.name}</span>
                <div>
                    <div class="search-name">${match.name}</div>
                    <div class="search-loc"><i class="fa-solid fa-map-pin"></i> ${match.district}</div>
                </div>
            `;
            
            li.onclick = () => {
                flyToStore(match.coords[0], match.coords[1]);
                showRadius(match.coords, match.brand.color); 
                
                const coordsString = `${match.coords[0]},${match.coords[1]}`;
                activePointCoords = coordsString;
                
                if (activePopup) activePopup.remove();

                const navUrl = `https://www.google.com/maps/search/?api=1&query=${match.coords[1]},${match.coords[0]}`;
                activePopup = new maplibregl.Popup({ className: 'modern-popup', offset: 10 })
                    .setLngLat(match.coords)
                    .setHTML(`
                        <div class="popup-title">${match.name}</div>
                        <div class="popup-address">${match.district}</div>
                        <a href="${navUrl}" target="_blank" class="btn-nav">
                            <i class="fa-solid fa-location-arrow"></i> Petunjuk Arah
                        </a>
                    `)
                    .addTo(map);
                
                activePopup.on('close', () => {
                    clearActiveSelection();
                });

                document.getElementById('detail-content').innerHTML = `<b>${match.name}</b><br><small>${match.district}</small>`;
                searchResults.style.display = 'none';
                searchInput.value = match.name;
            };
            searchResults.appendChild(li);
        });
        searchResults.style.display = 'block';
    } else {
        searchResults.innerHTML = `<li style="color:#94a3b8; padding:10px; text-align:center;">Data tidak ditemukan...</li>`;
        searchResults.style.display = 'block';
    }
});

document.addEventListener('click', function(e) {
    if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
        searchResults.style.display = 'none';
    }
});

// --- VARIABEL BARU UNTUK FITUR RADAR ---
let isRadiusToolActive = false;
let currentRadarCenter = null;

function toggleRadiusTool() {
    isRadiusToolActive = !isRadiusToolActive;
    const btn = document.getElementById('btn-radius-tool');
    const panel = document.getElementById('radius-control-panel');
    
    if (isRadiusToolActive) {
        btn.classList.add('active');
        btn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
        panel.style.display = 'block';
        map.getCanvas().style.cursor = 'crosshair';
        clearActiveSelection(); // Tutup popup/radius lama jika ada
    } else {
        deactivateRadiusTool();
    }
}

function deactivateRadiusTool() {
    isRadiusToolActive = false;
    const btn = document.getElementById('btn-radius-tool');
    const panel = document.getElementById('radius-control-panel');
    btn.classList.remove('active');
    btn.innerHTML = '<i class="fa-solid fa-circle-dot"></i>';
    panel.style.display = 'none';
    map.getCanvas().style.cursor = '';
    currentRadarCenter = null;
    resetMapFilter(); // Kembalikan semua titik ke opacity normal
    clearActiveSelection();
}

// Rumus Hitung Jarak (Haversine)
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius bumi dalam km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Hasil dalam km
}

function updateRadiusSize() {
    if (currentRadarCenter) {
        runRadarAnalysis(currentRadarCenter);
    }
}

function runRadarAnalysis(center) {
    currentRadarCenter = center;
    let val = parseFloat(document.getElementById('radius-value').value);
    const unit = document.getElementById('radius-unit').value;
    
    // Konversi ke KM untuk hitungan rumus
    let radiusInKm = unit === 'm' ? val / 1000 : val;

    // 1. Gambar Lingkaran di Peta
    const geojson = { type: 'FeatureCollection', features: [createCirclePolygon(center, radiusInKm)] };
    map.getSource('radius-source').setData(geojson);
    map.setPaintProperty('radius-layer', 'fill-color', '#10b981');

    // 2. Filter Data & Hitung Statistik
    let stats = {};
    let totalFound = 0;

    for (const layerId in storeData) {
        const brandName = brandInfo[layerId].name;
        stats[brandName] = 0;

        // Cek setiap fitur di dalam layer ini
        storeData[layerId].features.forEach(f => {
            const dist = getDistance(center[1], center[0], f.geometry.coordinates[1], f.geometry.coordinates[0]);
            if (dist <= radiusInKm) {
                stats[brandName]++;
                totalFound++;
            }
        });
    }

    // 3. Update UI Statistik di Panel Melayang
    let statsHtml = `<strong>Total: ${totalFound} gerai ditemukan</strong><br>`;
    for (const brand in stats) {
        if (stats[brand] > 0) statsHtml += `• ${brand}: ${stats[brand]}<br>`;
    }
    document.getElementById('filter-stats').innerHTML = statsHtml;

    // 4. Efek Visual: Redupkan yang di luar radius (Opsional)
    activeLayersList.forEach(id => {
        map.setPaintProperty(id, 'circle-opacity', [
            'case',
            ['<=', ['literal', 0], 0], // Placeholder logika filter per titik butuh data property jarak
            0.9, 0.9
        ]);
    });
}

function resetMapFilter() {
    activeLayersList.forEach(id => {
        if(map.getLayer(id)) map.setPaintProperty(id, 'circle-opacity', 0.9);
    });
}

// Modifikasi Event Click Peta
map.on('click', (e) => {
    if (isRadiusToolActive) {
        const coords = [e.lngLat.lng, e.lngLat.lat];
        runRadarAnalysis(coords);
    }
});

// --- FITUR UKUR JARAK (MEASURE TOOL) ---
let isMeasureToolActive = false;
let measurePoints = [];

function toggleMeasureTool() {
    isMeasureToolActive = !isMeasureToolActive;
    
    if (isMeasureToolActive) {
        isRadiusToolActive = false; // Matikan radar
        if (activePopup) activePopup.remove(); // Tutup popup retail
        // Matikan garis kompetitor biar ga ganggu pemandangan
        if (map.getLayer('competitor-line')) map.setLayoutProperty('competitor-line', 'visibility', 'none');
        
        map.getCanvas().style.cursor = 'crosshair';
        console.log("Mode Ukur Aktif");
    } else {
        deactivateMeasureTool();
        map.getCanvas().style.cursor = '';
    }
}

function deactivateMeasureTool() {
    isMeasureToolActive = false;
    const btn = document.getElementById('btn-measure-tool');
    btn.classList.remove('active');
    btn.style.background = '#10b981'; // Kembalikan ke warna hijau
    document.getElementById('measure-panel').style.display = 'none';
    map.getCanvas().style.cursor = '';
    clearMeasurement();
}

function clearMeasurement() {
    measurePoints = [];
    updateMeasureLayer();
    document.getElementById('measure-result').innerText = '0 m';
}

function updateMeasureLayer() {
    const geojson = { type: 'FeatureCollection', features: [] };

    // Masukkan Titik (Point)
    if (measurePoints.length > 0) {
        measurePoints.forEach(pt => {
            geojson.features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: pt } });
        });
    }
    // Masukkan Garis (LineString) jika titik lebih dari 1
    if (measurePoints.length > 1) {
        geojson.features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: measurePoints } });
    }

    if (map.getSource('measure-source')) {
        map.getSource('measure-source').setData(geojson);
    }
}

function calculateTotalDistance() {
    if (measurePoints.length < 2) return 0;
    let totalKm = 0;
    for (let i = 0; i < measurePoints.length - 1; i++) {
        // Menggunakan fungsi getDistance() (Rumus Haversine) dari fitur Radar
        totalKm += getDistance(measurePoints[i][1], measurePoints[i][0], measurePoints[i+1][1], measurePoints[i+1][0]);
    }
    return totalKm;
}

// --- FITUR SPLASH SCREEN LOADING ---
window.addEventListener('load', () => {
    // Kita beri jeda minimal 1.5 detik agar animasinya terlihat bagus dan profesional
    setTimeout(() => {
        const splash = document.getElementById('splash-screen');
        if (splash) {
            // Berikan efek transisi memudar
            splash.classList.add('splash-hidden');
            
            // Hapus elemen dari memori setelah transisi selesai (0.8 detik) agar tidak menumpuk
            setTimeout(() => {
                splash.remove();
            }, 800);
        }
    }, 1500); 
});

// --- VARIABEL TAMBAHAN ---
let isGeoActive = false;
let userLocation = null;
let userMarker = null;

// 1. FUNGSI GEOLOCATION & FIND NEAREST
function getUserLocation() {
    const btn = document.querySelector('[onclick="getUserLocation()"]');
    
    // JIKA AKTIF -> KITA CANCEL (MATIKAN)
    if (isGeoActive) {
        if (userMarker) userMarker.remove();
        if (map.getLayer(nearestLineLayerId)) map.removeLayer(nearestLineLayerId);
        if (map.getSource(nearestLineLayerId)) map.removeSource(nearestLineLayerId);
        
        btn.style.background = '#3b82f6'; // Kembalikan warna biru
        btn.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i>';
        isGeoActive = false;
        return;
    }

    // JIKA TIDAK AKTIF -> KITA CARI LOKASI
    if (!navigator.geolocation) return alert("Browser tidak mendukung geolocation.");

    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; // Loading state

    navigator.geolocation.getCurrentPosition((pos) => {
        const { longitude, latitude } = pos.coords;
        userLocation = [longitude, latitude];

        // 1. Tambah Marker Biru User
        const el = document.createElement('div');
        el.className = 'user-location-marker';
        userMarker = new maplibregl.Marker(el).setLngLat(userLocation).addTo(map);

        // 2. Cari Toko Terdekat
        const nearest = findNearestStore(userLocation);

        if (nearest.feature) {
            const storeCoords = nearest.feature.geometry.coordinates;
            
            // 3. Tarik Garis Visual ke Toko Terdekat
            const lineGeojson = {
                type: 'FeatureCollection',
                features: [{
                    type: 'Feature',
                    geometry: { type: 'LineString', coordinates: [userLocation, storeCoords] }
                }]
            };

            if (map.getSource(nearestLineLayerId)) {
                map.getSource(nearestLineLayerId).setData(lineGeojson);
            } else {
                map.addSource(nearestLineLayerId, { type: 'geojson', data: lineGeojson });
                map.addLayer({
                    id: nearestLineLayerId,
                    type: 'line',
                    source: nearestLineLayerId,
                    paint: { 'line-color': '#f59e0b', 'line-width': 3, 'line-dasharray': [2, 1] }
                });
            }

            // 4. Fokus Peta agar Keduanya Kelihatan (FitBounds)
            const bounds = new maplibregl.LngLatBounds().extend(userLocation).extend(storeCoords);
            map.fitBounds(bounds, { padding: 100 });
        }

        // 5. Update UI Tombol jadi Mode Cancel (Merah)
        btn.style.background = '#ef4444';
        btn.innerHTML = '<i class="fa-solid fa-location-dot"></i>';
        isGeoActive = true;

    }, (err) => {
        alert("Gagal mendapatkan lokasi. Pastikan izin lokasi aktif.");
        btn.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i>';
    });
}

function findNearestStore(coords) {
    let nearest = { dist: Infinity, feature: null, brand: null };

    // Scan semua data yang sudah ter-load di memori
    for (const layerId in storeData) {
        if (!storeData[layerId].features) continue;
        storeData[layerId].features.forEach(f => {
            if(!f.geometry || !f.geometry.coordinates) return;
            const d = getDistance(coords[1], coords[0], f.geometry.coordinates[1], f.geometry.coordinates[0]);
            if (d < nearest.dist) {
                nearest = { dist: d, feature: f, brand: brandInfo[layerId] };
            }
        });
    }
    return nearest;
}

function findNearestStore(coords) {
    let nearest = { dist: Infinity, feature: null, brand: null };

    for (const layerId in storeData) {
        storeData[layerId].features.forEach(f => {
            const d = getDistance(coords[1], coords[0], f.geometry.coordinates[1], f.geometry.coordinates[0]);
            if (d < nearest.dist) {
                nearest = { dist: d, feature: f, brand: brandInfo[layerId] };
            }
        });
    }

    if (nearest.feature) {
        const dText = nearest.dist < 1 ? (nearest.dist * 1000).toFixed(0) + ' m' : nearest.dist.toFixed(2) + ' km';
        alert(`Gerai terdekat adalah ${nearest.feature.properties.NAMA || 'Retail'} (${nearest.brand.name}) dengan jarak ${dText}`);
    }
}

// 2. FUNGSI GANTI BASEMAP
const basemaps = {
    'light': 'https://basemap.mapid.io/styles/light/?key=69f035056b53837be3de00d5&vector#8.77/-7.1936/108.1195',
    'dark': 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
    'satellite': {
        'version': 8,
        'sources': { 'raster-tiles': { 'type': 'raster', 'tiles': ['https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}'], 'tileSize': 256 } },
        'layers': [{ 'id': 'simple-tiles', 'type': 'raster', 'source': 'raster-tiles', 'minzoom': 0, 'maxzoom': 22 }]
    }
};

function toggleBasemapPanel() {
    const p = document.getElementById('basemap-panel');
    p.style.display = p.style.display === 'block' ? 'none' : 'block';
}

function changeBasemap(type) {
    // 1. Simpan status visibility layer saat ini
    const currentVisibility = {};
    activeLayersList.forEach(id => {
        if (map.getLayer(id)) {
            currentVisibility[id] = map.getLayoutProperty(id, 'visibility') || 'visible';
        }
    });

    // 2. Ganti Style
    map.setStyle(basemaps[type]);

    // 3. Setelah style baru dimuat
    map.once('style.load', () => {
        
        // --- PERBAIKAN KHUSUS SATELLITE ---
        // Jika tipe satellite, pastikan layer retail muncul di atasnya
        if (type === 'satellite') {
            // Kita tidak perlu melakukan apa-apa karena raster google 
            // sudah kita set sebagai layer pertama di objek basemaps. satellite
        }

        // Re-load Logos
        for (const [key, url] of Object.entries(LOGOS)) {
            map.loadImage(url, (err, img) => {
                if (!err && !map.hasImage('logo-' + key)) map.addImage('logo-' + key, img);
            });
        }

        // Re-add Sources dan Layers
        activeLayersList.forEach(layerId => {
            if (storeData[layerId]) {
                const color = brandInfo[layerId].color;
                const logoKey = layerId.split('-')[0];
                
                // Panggil fungsi inject utama kamu
                injectLayerToMap(layerId, storeData[layerId], color, logoKey);
                
                // Kembalikan status ON/OFF layer
                if (currentVisibility[layerId]) {
                    const vis = currentVisibility[layerId];
                    if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', vis);
                    if (map.getLayer(layerId + '-logo')) map.setLayoutProperty(layerId + '-logo', 'visibility', vis);
                    if (map.getLayer(layerId + '-clusters')) map.setLayoutProperty(layerId + '-clusters', 'visibility', vis);
                    if (map.getLayer(layerId + '-cluster-count')) map.setLayoutProperty(layerId + '-cluster-count', 'visibility', vis);
                }
            }
        });

        // Re-add Source untuk Tools
        if (!map.getSource('radius-source')) {
            map.addSource('radius-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
            map.addLayer({ id: 'radius-layer', type: 'fill', source: 'radius-source', paint: { 'fill-color': '#10b981', 'fill-opacity': 0.2 } });
        }
        
        if (!map.getSource('measure-source')) {
            map.addSource('measure-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
            map.addLayer({ id: 'measure-lines', type: 'line', source: 'measure-source', filter: ['==', '$type', 'LineString'], paint: { 'line-color': '#f59e0b', 'line-width': 3, 'line-dasharray': [2, 2] } });
            map.addLayer({ id: 'measure-points', type: 'circle', source: 'measure-source', filter: ['==', '$type', 'Point'], paint: { 'circle-color': '#f59e0b', 'circle-radius': 5 } });
        }

        document.getElementById('basemap-panel').style.display = 'none';
    });
}

// 3. FUNGSI SIMPAN RADIUS JADI LAYER
function saveRadarAsLayer() {
    if (!currentRadarCenter) return alert("Aktifkan radar dulu di peta!");
    
    let val = parseFloat(document.getElementById('radius-value').value);
    let unit = document.getElementById('radius-unit').value;
    let radiusInKm = unit === 'm' ? val / 1000 : val;
    
    const layerName = `Radar ${val}${unit}`;
    const layerId = `saved-radar-${Date.now()}`;
    const color = '#8b5cf6';
    
    const polygonGeojson = {
        type: 'FeatureCollection',
        features: [createCirclePolygon(currentRadarCenter, radiusInKm)]
    };

    // Tambah ke Map
    map.addSource(layerId, { type: 'geojson', data: polygonGeojson });
    map.addLayer({
        id: layerId, type: 'fill', source: layerId,
        paint: { 'fill-color': color, 'fill-opacity': 0.3, 'fill-outline-color': color }
    });

    // Tambah Kartu ke Sidebar
    const container = document.getElementById('custom-layers-container');
    const card = document.createElement('div');
    card.className = 'brand-card custom';
    card.id = 'card-' + layerId;
    card.style.borderLeft = `4px solid ${color}`;
    card.innerHTML = `
        <div class="brand-header">
            <div class="brand-title"><i class="fa-solid fa-draw-polygon"></i> ${layerName}</div>
            <div style="display:flex; gap:5px;">
                <button onclick="removeSavedLayer('${layerId}')" class="btn-delete-layer"><i class="fa-solid fa-trash"></i></button>
                <label class="switch"><input type="checkbox" checked onchange="toggleLayer('${layerId}')"><span class="slider"></span></label>
            </div>
        </div>
        <span class="stats-label">Area Jangkauan ${val}${unit}</span>
    `;
    container.appendChild(card);
    deactivateRadiusTool();
}

function removeSavedLayer(id) {
    if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(id)) map.removeSource(id);
    document.getElementById('card-' + id).remove();
}

function getCompetitorStatus(distanceKm) {
    const distM = distanceKm * 1000;
    if (distM < 100) return { label: 'Danger (High Conflict)', class: 'status-danger' };
    if (distM < 300) return { label: 'Warning (Close Range)', class: 'status-warning' };
    return { label: 'Safe (Normal)', class: 'status-safe' };
}

function findNearestCompetitor(currentCoords, currentLayerId) {
    let targetLayerId = currentLayerId.includes('alfa') ? 'indo-layer' : 'alfa-layer';
    let nearest = { dist: Infinity, coords: null, name: '' };

    if (storeData[targetLayerId] && storeData[targetLayerId].features) {
        storeData[targetLayerId].features.forEach(f => {
            if (!f.geometry || !f.geometry.coordinates) return;
            const d = getDistance(currentCoords[1], currentCoords[0], f.geometry.coordinates[1], f.geometry.coordinates[0]);
            if (d < nearest.dist) {
                nearest = { dist: d, coords: f.geometry.coordinates, name: f.properties.NAMA || f.properties.nama || "Indomaret/Alfamart" };
            }
        });
    }
    return nearest;
}

function getCompetitorStatus(distanceKm) {
    const distM = distanceKm * 1000;
    if (distM < 100) return { label: 'Danger (High Conflict)', class: 'status-danger' };
    if (distM < 300) return { label: 'Warning (Close Range)', class: 'status-warning' };
    return { label: 'Safe (Normal)', class: 'status-safe' };
}

function updateCompetitorLine(start, end) {
    const lineData = {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: [start, end] } }]
    };
    if (map.getSource('competitor-line')) {
        map.getSource('competitor-line').setData(lineData);
        map.setLayoutProperty('competitor-line', 'visibility', 'visible');
    } else {
        map.addSource('competitor-line', { type: 'geojson', data: lineData });
        map.addLayer({
            id: 'competitor-line', type: 'line', source: 'competitor-line',
            paint: { 'line-color': '#ef4444', 'line-width': 2, 'line-dasharray': [2, 2] }
        });
    }
}

function runRadarAnalysis(center) {
    currentRadarCenter = center;
    let val = parseFloat(document.getElementById('radius-value').value);
    let unit = document.getElementById('radius-unit').value;
    let radiusInKm = unit === 'm' ? val / 1000 : val;

    // 1. Gambar Radius di Peta
    const geojson = {
        type: 'FeatureCollection',
        features: [createCirclePolygon(center, radiusInKm)]
    };
    map.getSource('radius-source').setData(geojson);

    // 2. Kalkulasi Retail Spasial
    let stats = { alfa: 0, indo: 0, borma: 0, others: 0, total: 0 };

    for (const layerId in storeData) {
        if (storeData[layerId] && storeData[layerId].features) {
            storeData[layerId].features.forEach(f => {
                const d = getDistance(center[1], center[0], f.geometry.coordinates[1], f.geometry.coordinates[0]);
                if (d <= radiusInKm) {
                    stats.total++;
                    if (layerId.includes('alfa')) stats.alfa++;
                    else if (layerId.includes('indo')) stats.indo++;
                    else if (layerId.includes('borma')) stats.borma++;
                    else stats.others++;
                }
            });
        }
    }

    // 3. GENERATE INSIGHT (Logika Market Share)
    const alfaShare = stats.total > 0 ? ((stats.alfa / stats.total) * 100).toFixed(0) : 0;
    const indoShare = stats.total > 0 ? ((stats.indo / stats.total) * 100).toFixed(0) : 0;
    const ratio = (stats.indo / (stats.alfa || 1)).toFixed(1);

    // 4. Update UI Panel
    document.getElementById('spatial-analysis-summary').style.display = 'block';
    const analysisContainer = document.getElementById('analysis-results');
    
    analysisContainer.innerHTML = `
        <div class="stat-card" style="grid-column: span 2;">
            <span class="stat-label">Market Share (Alfamart vs Indomaret)</span>
            <div style="display:flex; justify-content:space-between; margin-bottom:2px;">
                <span>Alfa: ${alfaShare}%</span>
                <span>Indo: ${indoShare}%</span>
            </div>
            <div class="market-share-bar">
                <div class="share-fill" style="width: ${alfaShare}%; background: #ef4444;"></div>
            </div>
        </div>
        <div class="stat-card">
            <span class="stat-label">Competition Ratio</span>
            <span class="stat-value">1 : ${ratio}</span>
        </div>
        <div class="stat-card">
            <span class="stat-label">Saturation</span>
            <span class="stat-value" style="color: ${stats.total > 15 ? '#ef4444' : '#10b981'}">
                ${stats.total > 15 ? 'HIGH' : 'LOW'}
            </span>
        </div>
    `;

    // Beri info teks di filter-stats (yang lama)
    document.getElementById('filter-stats').innerHTML = `Terdeteksi <b>${stats.total}</b> gerai dalam radius ini.`;
}

// Reveal Animation on Scroll
function reveal() {
    var reveals = document.querySelectorAll(".reveal");
    for (var i = 0; i < reveals.length; i++) {
        var windowHeight = window.innerHeight;
        var elementTop = reveals[i].getBoundingClientRect().top;
        var elementVisible = 150;
        if (elementTop < windowHeight - elementVisible) {
            reveals[i].classList.add("active");
        }
    }
}

window.addEventListener("scroll", reveal);

// Initial call to reveal items already in view
reveal();

// Mouse Move Effect for Orbs (Subtle Parallax)
document.addEventListener('mousemove', (e) => {
    const orbs = document.querySelectorAll('.orb');
    const x = e.clientX / window.innerWidth;
    const y = e.clientY / window.innerHeight;
    
    orbs.forEach((orb, index) => {
        const speed = (index + 1) * 20;
        orb.style.transform = `translate(${x * speed}px, ${y * speed}px)`;
    });
});

// Navbar Blur on Scroll
window.addEventListener('scroll', () => {
    const nav = document.querySelector('.navbar');
    if (window.scrollY > 50) {
        nav.style.background = 'rgba(15, 23, 42, 0.8)';
    } else {
        nav.style.background = 'transparent';
    }
});

document.addEventListener("DOMContentLoaded", () => {
    console.log("RetailRay Landing Page Ready!");
    
    // Paksa semua elemen reveal muncul di awal
    const reveals = document.querySelectorAll(".reveal");
    reveals.forEach(el => el.classList.add("active"));
});

// Sisanya biarkan tetap ada untuk efek scroll nanti
window.addEventListener("scroll", reveal);
