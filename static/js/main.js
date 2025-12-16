// Global state
let reactorParams = [];
let detectorParams = [];
let nuclearData = [];
let standardSampleData = [];
let peakAreaData = [];
let savedCalculationResults = [];
let editingReactorId = null;
let editingDetectorId = null;
let editingPeakAreaId = null;
let neutronFluxChart = null; // Chart instance for neutron flux regression
let currentRegressionCoefficients = null; // Store regression coefficients (a, b) for Asp calculation
let monitorSpectraData = null; // Store monitor spectra data (Qo(a) and epsilon_p_a) for concentration calculation
let spectrumDecayCache = new Map(); // Cache thời gian chờ giữa kết thúc chiếu và bắt đầu đo cho từng phổ
const CSV_ENERGY_PREF_STORAGE_KEY = 'csvEnergyElementPreferences';
let csvEnergyElementPreferences = {};
// Lưu snapshot kết quả tính toán hiện tại (để copy sang module "Lưu kết quả tính toán")
let currentCalculationResultsForSaving = [];

// Helper function to format datetime
// Make sure it's defined in global scope
window.formatDateTime = function(dateTimeStr) {
    if (!dateTimeStr) return '-';
    try {
        // Nếu đã là định dạng dd/mm/yyyy HH:mm:ss, trả về luôn
        if (/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/.test(String(dateTimeStr).trim())) {
            return String(dateTimeStr).trim();
        }
        
        // Thử parse với nhiều định dạng
        // Định dạng yyyy-mm-dd HH:mm:ss hoặc yyyy-mm-ddTHH:mm:ss
        const isoMatch = String(dateTimeStr).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/);
        if (isoMatch) {
            const [, year, month, day, hour, minute, second] = isoMatch;
            return `${day}/${month}/${year} ${hour}:${minute}:${second}`;
        }
        
        // Thử parse với Date object (cho các định dạng khác)
        const dt = new Date(dateTimeStr);
        if (!isNaN(dt.getTime())) {
            const day = String(dt.getDate()).padStart(2, '0');
            const month = String(dt.getMonth() + 1).padStart(2, '0');
            const year = dt.getFullYear();
            const hours = String(dt.getHours()).padStart(2, '0');
            const minutes = String(dt.getMinutes()).padStart(2, '0');
            const seconds = String(dt.getSeconds()).padStart(2, '0');
            return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
        }
        
        // Nếu không parse được, trả về giá trị gốc
        return String(dateTimeStr);
    } catch (e) {
        return String(dateTimeStr) || '-';
    }
};

// Also define as regular function for backward compatibility
function formatDateTime(dateTimeStr) {
    return window.formatDateTime(dateTimeStr);
}

function loadCSVElementPreferences() {
    try {
        const data = localStorage.getItem(CSV_ENERGY_PREF_STORAGE_KEY);
        if (data) {
            const parsed = JSON.parse(data);
            if (typeof parsed === 'object' && parsed !== null) {
                return parsed;
            }
        }
    } catch (error) {
        console.warn('Unable to load CSV energy preferences:', error);
    }
    return {};
}

function saveCSVElementPreferences() {
    try {
        localStorage.setItem(CSV_ENERGY_PREF_STORAGE_KEY, JSON.stringify(csvEnergyElementPreferences));
    } catch (error) {
        console.warn('Unable to save CSV energy preferences:', error);
    }
}

function getEnergyPreferenceKey(energy) {
    if (typeof energy !== 'number' || isNaN(energy)) {
        return null;
    }
    return Math.round(energy).toString();
}

function rememberEnergyPreference(energy, element) {
    if (!element) return;
    const key = getEnergyPreferenceKey(energy);
    if (!key) return;
    csvEnergyElementPreferences[key] = {
        element: element,
        updated_at: Date.now()
    };
    saveCSVElementPreferences();
}

function getPreferredElementForEnergy(energy) {
    const key = getEnergyPreferenceKey(energy);
    if (!key) return null;
    const pref = csvEnergyElementPreferences[key];
    return pref && pref.element ? pref.element : null;
}

function parseDateTimeToDate(dateTimeStr) {
    if (!dateTimeStr) return null;
    try {
        const value = String(dateTimeStr).trim();
        const viMatch = value.match(/^(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?$/);
        if (viMatch) {
            const [, day, month, year, hour = '00', minute = '00', second = '00'] = viMatch;
            const formatted = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
            const dt = new Date(formatted);
            return isNaN(dt.getTime()) ? null : dt;
        }
        
        const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
        if (isoMatch) {
            const [, year, month, day, hour, minute, second = '00'] = isoMatch;
            const formatted = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
            const dt = new Date(formatted);
            return isNaN(dt.getTime()) ? null : dt;
        }
        
        const dt = new Date(value);
        return isNaN(dt.getTime()) ? null : dt;
    } catch (error) {
        return null;
    }
}

function getSpectrumDecayDurationSeconds(spectrumName) {
    if (!spectrumName) return null;
    try {
        const key = spectrumName.trim().toLowerCase();
        if (spectrumDecayCache.has(key)) {
            return spectrumDecayCache.get(key);
        }
        
        const sample = irradiatedSamples.find(s => (s.spectrum_name || '').trim().toLowerCase() === key);
        if (!sample) {
            spectrumDecayCache.set(key, null);
            return null;
        }
        
        const container = irradiatedContainers.find(c => c.container_name === sample.container_name);
        if (!container || !container.end_time) {
            spectrumDecayCache.set(key, null);
            return null;
        }
        
        const endTime = parseDateTimeToDate(container.end_time);
        const measurementStart = parseDateTimeToDate(sample.measurement_start_time);
        if (!endTime || !measurementStart) {
            spectrumDecayCache.set(key, null);
            return null;
        }
        
        const diffMs = measurementStart.getTime() - endTime.getTime();
        if (!isFinite(diffMs) || diffMs <= 0) {
            spectrumDecayCache.set(key, 0);
            return 0;
        }
        
        const seconds = diffMs / 1000;
        spectrumDecayCache.set(key, seconds);
        return seconds;
    } catch (error) {
        return null;
    }
}

// Initialize on page load
// Flags to avoid attaching duplicate event listeners
let irradiatedUploadInitialized = false;
let irradiatedFormInitialized = false;

document.addEventListener('DOMContentLoaded', function() {
    csvEnergyElementPreferences = loadCSVElementPreferences();
    loadReactorParameters();
    loadDetectorParameters();
    loadNuclearData();
    loadStandardSampleData();
    loadIrradiatedData();
    loadPeakAreaData();
    loadCalculationContainers();
    loadSavedCalculationResults();
    
    // Setup file upload areas
    setupFileUpload();
    setupStandardSampleFileUpload();
    // Các hàm này đã được bảo vệ bằng cờ khởi tạo,
    // nên có thể gọi nhiều lần mà không bị gắn listener trùng lặp
    setupIrradiatedFileUpload();
    setupIrradiatedFormSubmit();
    setupIrradiatedSampleFormSubmit();
    setupSpeFormSubmit();
    setupSpeDragAndDrop();
    
    // Setup peak area form submit
    const peakAreaForm = document.getElementById('peak-area-form');
    if (peakAreaForm) {
        peakAreaForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const peakAreaErrorValue = document.getElementById('peak-area-peak-area-error').value;
            const data = {
                container_name: document.getElementById('peak-area-container-name').value,
                spectrum_name: document.getElementById('peak-area-spectrum-name').value,
                element_name: document.getElementById('peak-area-element-name').value,
                energy: parseFloat(document.getElementById('peak-area-energy').value),
                peak_area: parseFloat(document.getElementById('peak-area-peak-area').value),
                peak_area_error: peakAreaErrorValue ? parseFloat(peakAreaErrorValue) : null
            };
            
            try {
                const id = editingPeakAreaId;
                const url = id !== null ? `/api/peak-area/data/${id}` : '/api/peak-area/data';
                const method = id !== null ? 'PUT' : 'POST';
                
                const response = await fetch(url, {
                    method: method,
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(data)
                });
                
                const result = await response.json();
        if (result.success) {
            // Save last used values for next time
            saveLastPeakAreaValues(
                data.container_name,
                data.spectrum_name,
                data.element_name
            );
            
            showToast(result.message);
            
            // Reload data table
            loadPeakAreaData();
            
            // If adding new (not editing), reset form but keep selected values
            if (editingPeakAreaId === null) {
                // Keep container, spectrum, and element
                const currentContainer = document.getElementById('peak-area-container-name').value;
                const currentSpectrum = document.getElementById('peak-area-spectrum-name').value;
                const currentElement = document.getElementById('peak-area-element-name').value;
                const currentEnergy = document.getElementById('peak-area-energy').value;
                
                // Reset only the fields that need to be changed
                document.getElementById('peak-area-id').value = '';
                document.getElementById('peak-area-peak-area').value = '';
                
                // Reset energy dropdown but keep element selected
                if (currentElement) {
                    await loadEnergies();
                    // Optionally keep the same energy selected
                    if (currentEnergy) {
                        document.getElementById('peak-area-energy').value = currentEnergy;
                    }
                } else {
                    document.getElementById('peak-area-energy').innerHTML = '<option value="">-- Chọn năng lượng --</option>';
                }
                
                // Focus on peak area input for quick entry
                document.getElementById('peak-area-peak-area').focus();
            } else {
                // If editing, close modal
                closePeakAreaModal();
            }
        } else {
            showToast('Lỗi: ' + result.error, 'error');
        }
            } catch (error) {
                showToast('Lỗi kết nối: ' + error.message, 'error');
            }
        });
    }
});

// Tab switching
function switchTab(tab, event) {
    // Hide all main tabs
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    // Show selected main tab
    const tabElement = document.getElementById(tab + '-tab');
    if (tabElement) {
        tabElement.classList.add('active');
    }
    
    // Activate clicked button
    if (event && event.target) {
        event.target.classList.add('active');
    } else {
        // Fallback: find button by onclick attribute
        document.querySelectorAll('.tab-btn').forEach(btn => {
            if (btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(`'${tab}'`)) {
                btn.classList.add('active');
            }
        });
    }
    
    // If switching to system-data tab, show first sub-tab
    if (tab === 'system-data') {
        switchSubTab('reactor');
    }
    
    // If switching to calculation-sample tab, show first sub-tab
    if (tab === 'calculation-sample') {
        switchSubTab('irradiated-sample');
    }

    // Nếu chuyển sang tab lưu kết quả tính toán thì load lại danh sách
    if (tab === 'saved-calculation') {
        loadSavedCalculationResults();
    }
}

// Sub-tab switching (within system-data tab)
function switchSubTab(subTab) {
    // Hide all sub-tabs
    document.querySelectorAll('.sub-tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.querySelectorAll('.sub-tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    // Show selected sub-tab
    const subTabElement = document.getElementById(subTab + '-subtab');
    if (subTabElement) {
        subTabElement.classList.add('active');
    }
    
    // Activate sub-tab button - find button by onclick attribute
    document.querySelectorAll('.sub-tab-btn').forEach(btn => {
        if (btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(`'${subTab}'`)) {
            btn.classList.add('active');
        }
    });
    
    // Setup file upload for irradiated sample tab if needed
    if (subTab === 'irradiated-sample') {
        setTimeout(() => {
            setupIrradiatedFileUpload();
            setupIrradiatedFormSubmit();
        }, 100);
    }
    
    // Load calculation containers when switching to calculation-result subtab
    if (subTab === 'calculation-result') {
        loadCalculationContainers();
    }
    
    // Render MathJax when switching to formulas subtab
    if (subTab === 'formulas' && window.MathJax) {
        setTimeout(() => {
            MathJax.typesetPromise().catch(function (err) {
                console.error('MathJax rendering error:', err);
            });
        }, 100);
    }
}

// ========== Reactor Parameter Functions ==========

async function loadReactorParameters() {
    try {
        const response = await fetch('/api/reactor/parameters');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const result = await response.json();
        if (result.success) {
            reactorParams = result.data;
            renderReactorTable();
            // Reload irradiation positions dropdown when reactor parameters change
            loadIrradiationPositions();
        } else {
            showToast('Lỗi khi tải dữ liệu: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('Error loading reactor parameters:', error);
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            showToast('Không thể kết nối đến server. Vui lòng kiểm tra xem server có đang chạy không.', 'error');
        } else {
            showToast('Lỗi kết nối: ' + error.message, 'error');
        }
    }
}

async function loadIrradiationPositions() {
    try {
        const response = await fetch('/api/reactor/positions');
        const result = await response.json();
        if (result.success) {
            const selectIds = ['irradiated-irradiation-position', 'spe-irradiation-position'];
            selectIds.forEach(selectId => {
                const select = document.getElementById(selectId);
                if (!select) {
                    return;
                }
                const currentValue = select.value;
                select.innerHTML = '<option value="">-- Chọn vị trí chiếu --</option>';
                result.data.forEach(position => {
                    const option = document.createElement('option');
                    option.value = position;
                    option.textContent = position;
                    select.appendChild(option);
                });
                if (currentValue) {
                    const optionExists = Array.from(select.options).some(opt => opt.value === currentValue);
                    if (optionExists) {
                        select.value = currentValue;
                    }
                }
            });
        }
    } catch (error) {
        console.error('Error loading irradiation positions:', error);
    }
}

function renderReactorTable() {
    const tbody = document.getElementById('reactor-tbody');
    tbody.innerHTML = '';

    if (reactorParams.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 40px; color: var(--text-secondary);">Chưa có dữ liệu. Hãy thêm thông số lò mới.</td></tr>';
        return;
    }

    reactorParams.forEach(param => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${param.id}</td>
            <td><strong>${param.position}</strong></td>
            <td>${param.f_factor.toFixed(6)}</td>
            <td>±${param.f_uncertainty.toFixed(6)}</td>
            <td>${param.alpha_factor.toFixed(6)}</td>
            <td>±${param.alpha_uncertainty.toFixed(6)}</td>
            <td>${param.note || '-'}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-edit" onclick="editReactorParameter(${param.id})">
                        <i class="fas fa-edit"></i> Sửa
                    </button>
                    <button class="btn btn-danger" onclick="deleteReactorParameter(${param.id})">
                        <i class="fas fa-trash"></i> Xóa
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function filterReactorParams() {
    const filter = document.getElementById('reactor-position-filter').value.toLowerCase();
    const tbody = document.getElementById('reactor-tbody');
    const rows = tbody.querySelectorAll('tr');

    rows.forEach(row => {
        const position = row.cells[1]?.textContent.toLowerCase() || '';
        row.style.display = position.includes(filter) ? '' : 'none';
    });
}

function showReactorModal(id = null) {
    editingReactorId = id;
    const modal = document.getElementById('reactor-modal');
    const form = document.getElementById('reactor-form');
    const title = document.getElementById('reactor-modal-title');

    if (id !== null) {
        title.textContent = 'Sửa Thông số Lò phản ứng';
        const param = reactorParams.find(p => p.id === id);
        if (param) {
            document.getElementById('reactor-id').value = param.id;
            document.getElementById('reactor-position').value = param.position;
            document.getElementById('reactor-f-factor').value = param.f_factor;
            document.getElementById('reactor-f-uncertainty').value = param.f_uncertainty;
            document.getElementById('reactor-alpha-factor').value = param.alpha_factor;
            document.getElementById('reactor-alpha-uncertainty').value = param.alpha_uncertainty;
            document.getElementById('reactor-note').value = param.note || '';
        }
    } else {
        title.textContent = 'Thêm Thông số Lò phản ứng';
        form.reset();
        document.getElementById('reactor-id').value = '';
    }

    modal.classList.add('active');
}

function closeReactorModal() {
    document.getElementById('reactor-modal').classList.remove('active');
    editingReactorId = null;
}

document.getElementById('reactor-form').addEventListener('submit', async function(e) {
    e.preventDefault();

    const data = {
        position: document.getElementById('reactor-position').value,
        f_factor: parseFloat(document.getElementById('reactor-f-factor').value),
        f_uncertainty: parseFloat(document.getElementById('reactor-f-uncertainty').value),
        alpha_factor: parseFloat(document.getElementById('reactor-alpha-factor').value),
        alpha_uncertainty: parseFloat(document.getElementById('reactor-alpha-uncertainty').value),
        note: document.getElementById('reactor-note').value
    };

    try {
        const id = editingReactorId;
        const url = id !== null ? `/api/reactor/parameters/${id}` : '/api/reactor/parameters';
        const method = id !== null ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();
        if (result.success) {
            showToast(result.message);
            closeReactorModal();
            loadReactorParameters();
        } else {
            showToast('Lỗi: ' + result.error, 'error');
        }
    } catch (error) {
        showToast('Lỗi kết nối: ' + error.message, 'error');
    }
});

async function editReactorParameter(id) {
    showReactorModal(id);
}

async function deleteReactorParameter(id) {
    if (!confirm('Bạn có chắc chắn muốn xóa thông số lò này?')) {
        return;
    }

    try {
        const response = await fetch(`/api/reactor/parameters/${id}`, {
            method: 'DELETE'
        });

        const result = await response.json();
        if (result.success) {
            showToast(result.message);
            loadReactorParameters();
        } else {
            showToast('Lỗi: ' + result.error, 'error');
        }
    } catch (error) {
        showToast('Lỗi kết nối: ' + error.message, 'error');
    }
}

// ========== Detector Parameter Functions ==========

async function loadDetectorParameters() {
    try {
        const response = await fetch('/api/detector/parameters');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const result = await response.json();
        if (result.success) {
            detectorParams = result.data;
            renderDetectorTable();
        } else {
            showToast('Lỗi khi tải dữ liệu: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('Error loading detector parameters:', error);
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            showToast('Không thể kết nối đến server. Vui lòng kiểm tra xem server có đang chạy không.', 'error');
        } else {
            showToast('Lỗi kết nối: ' + error.message, 'error');
        }
    }
}

function renderDetectorTable() {
    const tbody = document.getElementById('detector-tbody');
    tbody.innerHTML = '';

    if (detectorParams.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px; color: var(--text-secondary);">Chưa có dữ liệu. Hãy thêm thông số detector mới.</td></tr>';
        return;
    }

    detectorParams.forEach(param => {
        const coeffs = param.efficiency_coefficients.map(c => c.toFixed(6)).join(', ');
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${param.id}</td>
            <td><strong>${param.detector_name}</strong></td>
            <td>${param.position}</td>
            <td>${param.efficiency_type === 'degree_4' ? 'Bậc 4' : 'Bậc 5'}</td>
            <td style="font-size: 0.85rem; max-width: 300px; overflow: hidden; text-overflow: ellipsis;" title="${coeffs}">${coeffs}</td>
            <td>${param.note || '-'}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-edit" onclick="editDetectorParameter(${param.id})">
                        <i class="fas fa-edit"></i> Sửa
                    </button>
                    <button class="btn btn-danger" onclick="deleteDetectorParameter(${param.id})">
                        <i class="fas fa-trash"></i> Xóa
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function filterDetectorParams() {
    const nameFilter = document.getElementById('detector-name-filter').value.toLowerCase();
    const positionFilter = document.getElementById('detector-position-filter').value.toLowerCase();
    const tbody = document.getElementById('detector-tbody');
    const rows = tbody.querySelectorAll('tr');

    rows.forEach(row => {
        const name = row.cells[1]?.textContent.toLowerCase() || '';
        const position = row.cells[2]?.textContent.toLowerCase() || '';
        const show = name.includes(nameFilter) && position.includes(positionFilter);
        row.style.display = show ? '' : 'none';
    });
}

function updateEfficiencyCoefficients() {
    const type = document.getElementById('detector-efficiency-type').value;
    const container = document.getElementById('efficiency-coefficients-container');
    const formulaBox = document.getElementById('efficiency-formula');

    container.innerHTML = '';

    if (!type) {
        formulaBox.innerHTML = '';
        return;
    }

    if (type === 'degree_4') {
        formulaBox.innerHTML = '<strong>Công thức bậc 4:</strong><br>ε(E) = a₀ + a₁·log(E) + a₂·log(E)² + a₃·log(E)³ + a₄·log(E)⁴';
        
        for (let i = 0; i < 5; i++) {
            const group = document.createElement('div');
            group.className = 'coefficient-group';
            group.innerHTML = `
                <label>Hệ số a${i} <span class="required">*</span></label>
                <input type="number" id="coeff-${i}" step="0.0000001" required>
                <input type="number" id="coeff-unc-${i}" step="0.0000001" placeholder="Sai số a${i}" required>
            `;
            container.appendChild(group);
        }
    } else if (type === 'degree_5') {
        formulaBox.innerHTML = '<strong>Công thức bậc 5:</strong><br>ε(E) = a₀ + a₁·log(E) + a₂·log(E)² + a₃·log(E)³ + a₄·log(E)⁴ + a₅·log(E)⁵';
        
        for (let i = 0; i < 6; i++) {
            const group = document.createElement('div');
            group.className = 'coefficient-group';
            group.innerHTML = `
                <label>Hệ số a${i} <span class="required">*</span></label>
                <input type="number" id="coeff-${i}" step="0.0000001" required>
                <input type="number" id="coeff-unc-${i}" step="0.0000001" placeholder="Sai số a${i}" required>
            `;
            container.appendChild(group);
        }
    }
}

function showDetectorModal(id = null) {
    editingDetectorId = id;
    const modal = document.getElementById('detector-modal');
    const form = document.getElementById('detector-form');
    const title = document.getElementById('detector-modal-title');

    if (id !== null) {
        title.textContent = 'Sửa Thông số Detector';
        const param = detectorParams.find(p => p.id === id);
        if (param) {
            document.getElementById('detector-id').value = param.id;
            document.getElementById('detector-name').value = param.detector_name;
            document.getElementById('detector-position').value = param.position;
            document.getElementById('detector-efficiency-type').value = param.efficiency_type;
            updateEfficiencyCoefficients();
            
            // Fill coefficients
            param.efficiency_coefficients.forEach((coeff, i) => {
                document.getElementById(`coeff-${i}`).value = coeff;
            });
            param.coefficient_uncertainties.forEach((unc, i) => {
                document.getElementById(`coeff-unc-${i}`).value = unc;
            });
            document.getElementById('detector-note').value = param.note || '';
        }
    } else {
        title.textContent = 'Thêm Thông số Detector';
        form.reset();
        document.getElementById('detector-id').value = '';
        document.getElementById('efficiency-formula').innerHTML = '';
        document.getElementById('efficiency-coefficients-container').innerHTML = '';
    }

    modal.classList.add('active');
}

function closeDetectorModal() {
    document.getElementById('detector-modal').classList.remove('active');
    editingDetectorId = null;
}

document.getElementById('detector-form').addEventListener('submit', async function(e) {
    e.preventDefault();

    const type = document.getElementById('detector-efficiency-type').value;
    const numCoeffs = type === 'degree_4' ? 5 : 6;
    
    const coefficients = [];
    const uncertainties = [];
    
    for (let i = 0; i < numCoeffs; i++) {
        const coeff = parseFloat(document.getElementById(`coeff-${i}`).value);
        const unc = parseFloat(document.getElementById(`coeff-unc-${i}`).value);
        if (isNaN(coeff) || isNaN(unc)) {
            showToast('Vui lòng điền đầy đủ các hệ số và sai số', 'error');
            return;
        }
        coefficients.push(coeff);
        uncertainties.push(unc);
    }

    const data = {
        detector_name: document.getElementById('detector-name').value,
        position: document.getElementById('detector-position').value,
        efficiency_type: type,
        efficiency_coefficients: coefficients,
        coefficient_uncertainties: uncertainties,
        note: document.getElementById('detector-note').value
    };

    try {
        const id = editingDetectorId;
        const url = id !== null ? `/api/detector/parameters/${id}` : '/api/detector/parameters';
        const method = id !== null ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();
        if (result.success) {
            showToast(result.message);
            closeDetectorModal();
            loadDetectorParameters();
        } else {
            showToast('Lỗi: ' + result.error, 'error');
        }
    } catch (error) {
        showToast('Lỗi kết nối: ' + error.message, 'error');
    }
});

async function editDetectorParameter(id) {
    showDetectorModal(id);
}

async function deleteDetectorParameter(id) {
    if (!confirm('Bạn có chắc chắn muốn xóa thông số detector này?')) {
        return;
    }

    try {
        const response = await fetch(`/api/detector/parameters/${id}`, {
            method: 'DELETE'
        });

        const result = await response.json();
        if (result.success) {
            showToast(result.message);
            loadDetectorParameters();
        } else {
            showToast('Lỗi: ' + result.error, 'error');
        }
    } catch (error) {
        showToast('Lỗi kết nối: ' + error.message, 'error');
    }
}

// ========== Utility Functions ==========

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast ' + type;
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// ========== Nuclear Data Functions ==========

async function loadNuclearData() {
    try {
        const response = await fetch('/api/nuclear/data');
        const result = await response.json();
        if (result.success) {
            nuclearData = result.data;
            document.getElementById('nuclear-data-count').textContent = result.count || 0;
            renderNuclearTable();
        } else {
            showToast('Lỗi khi tải dữ liệu: ' + result.error, 'error');
        }
    } catch (error) {
        showToast('Lỗi kết nối: ' + error.message, 'error');
    }
}

function renderNuclearTable() {
    const tbody = document.getElementById('nuclear-tbody');
    tbody.innerHTML = '';

    if (nuclearData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; padding: 40px; color: var(--text-secondary);">Chưa có dữ liệu. Hãy import file CSV để thêm dữ liệu hạt nhân.</td></tr>';
        return;
    }

    nuclearData.forEach(item => {
        const row = document.createElement('tr');
        
        // Hàm helper để hiển thị giá trị (xử lý None/null)
        const formatValue = (value, formatFunc = null) => {
            if (value === null || value === undefined || value === '') {
                return '<span style="color: #94a3b8; font-style: italic;">-</span>';
            }
            if (formatFunc) {
                try {
                    return formatFunc(value);
                } catch (e) {
                    return value;
                }
            }
            return value;
        };
        
        row.innerHTML = `
            <td>${item.id}</td>
            <td><strong>${item.code || '-'}</strong></td>
            <td>${item.element || '-'}</td>
            <td>${item.emitter || '-'}</td>
            <td>${formatValue(item.A)}</td>
            <td>${formatValue(item.E, v => v.toFixed(2))}</td>
            <td>${formatValue(item.k0, v => v.toExponential(3))}</td>
            <td>${formatValue(item.Q0, v => v.toExponential(3))}</td>
            <td>${formatValue(item.T_half)}</td>
            <td>${formatValue(item.Er, v => v.toFixed(2))}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-edit" onclick="editNuclearData(${item.id})">
                        <i class="fas fa-edit"></i> Sửa
                    </button>
                    <button class="btn btn-danger" onclick="deleteNuclearData(${item.id})">
                        <i class="fas fa-trash"></i> Xóa
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function filterNuclearData() {
    const codeFilter = document.getElementById('nuclear-code-filter').value.toLowerCase();
    const elementFilter = document.getElementById('nuclear-element-filter').value.toLowerCase();
    const emitterFilter = document.getElementById('nuclear-emitter-filter').value.toLowerCase();
    const tbody = document.getElementById('nuclear-tbody');
    const rows = tbody.querySelectorAll('tr');

    rows.forEach(row => {
        const code = row.cells[1]?.textContent.toLowerCase() || '';
        const element = row.cells[2]?.textContent.toLowerCase() || '';
        const emitter = row.cells[3]?.textContent.toLowerCase() || '';
        const show = code.includes(codeFilter) && 
                     element.includes(elementFilter) && 
                     emitter.includes(emitterFilter);
        row.style.display = show ? '' : 'none';
    });
}

function setupFileUpload() {
    const uploadArea = document.getElementById('file-upload-area');
    const fileInput = document.getElementById('nuclear-csv-file');
    const fileLink = uploadArea.querySelector('.file-link');

    // Click to select file
    uploadArea.addEventListener('click', () => {
        fileInput.click();
    });

    fileLink.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.click();
    });

    // Drag and drop
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        
        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].name.endsWith('.csv')) {
            fileInput.files = files;
            handleFileSelect({ target: fileInput });
        } else {
            showToast('Vui lòng chọn file CSV', 'error');
        }
    });
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        const fileInfo = document.getElementById('file-info');
        fileInfo.textContent = `Đã chọn: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`;
    }
}

document.getElementById('nuclear-upload-form').addEventListener('submit', async function(e) {
    e.preventDefault();

    const fileInput = document.getElementById('nuclear-csv-file');
    const file = fileInput.files[0];

    if (!file) {
        showToast('Vui lòng chọn file CSV', 'error');
        return;
    }

    if (!file.name.endsWith('.csv')) {
        showToast('File phải có định dạng CSV', 'error');
        return;
    }

    // Confirm before import
    const confirmMessage = 'BẠN CÓ CHẮC CHẮN MUỐN IMPORT FILE CSV MỚI?\n\n' +
                          '⚠️ CẢNH BÁO: TOÀN BỘ dữ liệu hạt nhân hiện tại sẽ bị XÓA và thay thế bằng dữ liệu mới từ file CSV.\n\n' +
                          'Vui lòng đảm bảo bạn đã sao lưu dữ liệu cũ trước khi tiếp tục.';
    
    if (!confirm(confirmMessage)) {
        return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('/api/nuclear/data/upload', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        if (result.success) {
            showToast(result.message);
            loadNuclearData();
            // Reset form
            document.getElementById('nuclear-upload-form').reset();
            document.getElementById('file-info').textContent = '';
        } else {
            showToast('Lỗi: ' + result.error, 'error');
        }
    } catch (error) {
        showToast('Lỗi kết nối: ' + error.message, 'error');
    }
});

async function downloadTemplate() {
    try {
        const response = await fetch('/api/nuclear/data/template');
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'nuclear_data_template.csv';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            showToast('Đã tải file mẫu thành công');
        } else {
            const result = await response.json();
            showToast('Lỗi: ' + result.error, 'error');
        }
    } catch (error) {
        showToast('Lỗi kết nối: ' + error.message, 'error');
    }
}

async function downloadNuclearData() {
    try {
        const response = await fetch('/api/nuclear/data/download');
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'nuclear_data.csv';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            showToast('Đã tải dữ liệu thành công');
        } else {
            const result = await response.json();
            showToast('Lỗi: ' + result.error, 'error');
        }
    } catch (error) {
        showToast('Lỗi kết nối: ' + error.message, 'error');
    }
}

// ========== Nuclear Data CRUD Functions ==========

let editingNuclearDataId = null;

function showNuclearDataModal(id = null) {
    editingNuclearDataId = id;
    const modal = document.getElementById('nuclear-modal');
    const form = document.getElementById('nuclear-form');
    const title = document.getElementById('nuclear-modal-title');

    if (id !== null) {
        title.textContent = 'Sửa Dữ liệu Hạt nhân';
        const data = nuclearData.find(d => d.id === id);
        if (data) {
            document.getElementById('nuclear-id').value = data.id;
            document.getElementById('nuclear-code').value = data.code || '';
            document.getElementById('nuclear-element').value = data.element || '';
            document.getElementById('nuclear-emitter').value = data.emitter || '';
            document.getElementById('nuclear-A').value = data.A !== null && data.A !== undefined ? data.A : '';
            document.getElementById('nuclear-E').value = data.E !== null && data.E !== undefined ? data.E : '';
            document.getElementById('nuclear-k0').value = data.k0 !== null && data.k0 !== undefined ? data.k0 : '';
            document.getElementById('nuclear-Q0').value = data.Q0 !== null && data.Q0 !== undefined ? data.Q0 : '';
            document.getElementById('nuclear-T-half').value = data.T_half !== null && data.T_half !== undefined ? data.T_half : '';
            document.getElementById('nuclear-Er').value = data.Er !== null && data.Er !== undefined ? data.Er : '';
        }
    } else {
        title.textContent = 'Thêm Dữ liệu Hạt nhân';
        form.reset();
        document.getElementById('nuclear-id').value = '';
    }

    modal.classList.add('active');
}

function closeNuclearDataModal() {
    document.getElementById('nuclear-modal').classList.remove('active');
    editingNuclearDataId = null;
}

document.getElementById('nuclear-form').addEventListener('submit', async function(e) {
    e.preventDefault();

    const data = {
        code: document.getElementById('nuclear-code').value,
        element: document.getElementById('nuclear-element').value,
        emitter: document.getElementById('nuclear-emitter').value,
        A: document.getElementById('nuclear-A').value || null,
        E: document.getElementById('nuclear-E').value || null,
        k0: document.getElementById('nuclear-k0').value || null,
        Q0: document.getElementById('nuclear-Q0').value || null,
        T_half: document.getElementById('nuclear-T-half').value || null,
        Er: document.getElementById('nuclear-Er').value || null
    };

    try {
        const id = editingNuclearDataId;
        const url = id !== null ? `/api/nuclear/data/${id}` : '/api/nuclear/data';
        const method = id !== null ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();
        if (result.success) {
            showToast(result.message);
            closeNuclearDataModal();
            loadNuclearData();
        } else {
            showToast('Lỗi: ' + result.error, 'error');
        }
    } catch (error) {
        showToast('Lỗi kết nối: ' + error.message, 'error');
    }
});

async function editNuclearData(id) {
    showNuclearDataModal(id);
}

async function deleteNuclearData(id) {
    if (!confirm('Bạn có chắc chắn muốn xóa dữ liệu hạt nhân này?')) {
        return;
    }

    try {
        const response = await fetch(`/api/nuclear/data/${id}`, {
            method: 'DELETE'
        });

        const result = await response.json();
        if (result.success) {
            showToast(result.message);
            loadNuclearData();
        } else {
            showToast('Lỗi: ' + result.error, 'error');
        }
    } catch (error) {
        showToast('Lỗi kết nối: ' + error.message, 'error');
    }
}

// ========== Standard Sample Data Functions ==========

let standardSampleNames = [];

async function loadStandardSampleNames() {
    try {
        const response = await fetch('/api/standard-sample/sample-names');
        const result = await response.json();
        if (result.success) {
            standardSampleNames = result.data;
            // Cập nhật datalist
            const datalist = document.getElementById('sample-names-list');
            if (datalist) {
                datalist.innerHTML = '';
                standardSampleNames.forEach(name => {
                    const option = document.createElement('option');
                    option.value = name;
                    datalist.appendChild(option);
                });
            }
        }
    } catch (error) {
        console.error('Error loading sample names:', error);
    }
}

async function loadStandardSampleData() {
    try {
        const response = await fetch('/api/standard-sample/data');
        const result = await response.json();
        if (result.success) {
            standardSampleData = result.data;
            document.getElementById('standard-sample-data-count').textContent = result.count || 0;
            renderStandardSampleTable();
            // Reload sample names
            await loadStandardSampleNames();
        } else {
            showToast('Lỗi khi tải dữ liệu: ' + result.error, 'error');
        }
    } catch (error) {
        showToast('Lỗi kết nối: ' + error.message, 'error');
    }
}

function renderStandardSampleTable() {
    const tbody = document.getElementById('standard-sample-tbody');
    tbody.innerHTML = '';

    if (standardSampleData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px; color: var(--text-secondary);">Chưa có dữ liệu. Hãy thêm dữ liệu mẫu chuẩn mới.</td></tr>';
        return;
    }

    // Nhóm dữ liệu theo tên mẫu chuẩn
    const groupedData = {};
    standardSampleData.forEach(item => {
        const sampleName = item.sample_name || 'Không tên';
        if (!groupedData[sampleName]) {
            groupedData[sampleName] = [];
        }
        groupedData[sampleName].push(item);
    });

    const formatValue = (value, formatFunc = null) => {
        if (value === null || value === undefined || value === '') {
            return '<span style="color: #94a3b8; font-style: italic;">-</span>';
        }
        if (formatFunc) {
            try {
                return formatFunc(value);
            } catch (e) {
                return value;
            }
        }
        return value;
    };

    // Render từng mẫu chuẩn
    Object.keys(groupedData).forEach(sampleName => {
        const elements = groupedData[sampleName];
        const sampleId = `sample-${sampleName.replace(/\s+/g, '-').toLowerCase()}`;
        
        // Row chính cho mẫu chuẩn
        const mainRow = document.createElement('tr');
        mainRow.className = 'sample-header-row';
        mainRow.id = sampleId;
        mainRow.innerHTML = `
            <td colspan="2" style="background: var(--bg-color); font-weight: 700; cursor: pointer;" onclick="toggleSampleElements('${sampleId}')">
                <i class="fas fa-chevron-right sample-chevron" id="chevron-${sampleId}"></i>
                <strong>${sampleName}</strong>
                <span style="color: var(--text-secondary); font-weight: normal; margin-left: 10px;">
                    (${elements.length} nguyên tố)
                </span>
            </td>
            <td colspan="4" style="background: var(--bg-color);">
                <div class="action-buttons">
                    <button class="btn btn-primary" onclick="event.stopPropagation(); showStandardSampleModal(null, '${sampleName}')" style="padding: 6px 12px; font-size: 0.9rem;">
                        <i class="fas fa-plus"></i> Thêm nguyên tố
                    </button>
                    <button class="btn btn-edit" onclick="event.stopPropagation(); editSampleName('${sampleName}')" style="padding: 6px 12px; font-size: 0.9rem;">
                        <i class="fas fa-edit"></i> Sửa tên
                    </button>
                    <button class="btn btn-danger" onclick="event.stopPropagation(); deleteSample('${sampleName}')" style="padding: 6px 12px; font-size: 0.9rem;">
                        <i class="fas fa-trash"></i> Xóa mẫu
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(mainRow);

        // Container cho các nguyên tố (ẩn mặc định)
        const elementsContainer = document.createElement('tr');
        elementsContainer.className = 'sample-elements-row';
        elementsContainer.id = `elements-${sampleId}`;
        elementsContainer.style.display = 'none';
        
        const elementsCell = document.createElement('td');
        elementsCell.colSpan = 6;
        elementsCell.style.padding = '0';
        elementsCell.style.background = '#fafafa';
        
        const elementsTable = document.createElement('table');
        elementsTable.style.width = '100%';
        elementsTable.style.borderCollapse = 'collapse';
        
        const elementsTbody = document.createElement('tbody');
        
        elements.forEach(item => {
            const elementRow = document.createElement('tr');
            elementRow.style.borderTop = '1px solid var(--border-color)';
            elementRow.innerHTML = `
                <td style="padding: 12px; width: 60px; text-align: center;">${item.id}</td>
                <td style="padding: 12px; padding-left: 40px;">
                    <i class="fas fa-circle" style="font-size: 0.5rem; color: var(--primary-color); margin-right: 10px;"></i>
                    ${item.element || '-'}
                </td>
                <td style="padding: 12px;">${formatValue(item.concentration, v => v.toFixed(2))} ppm</td>
                <td style="padding: 12px;">${formatValue(item.uncertainty, v => v.toFixed(2))} ppm</td>
                <td style="padding: 12px;">
                    <div class="action-buttons">
                        <button class="btn btn-edit" onclick="editStandardSampleData(${item.id})" style="padding: 6px 12px; font-size: 0.85rem;">
                            <i class="fas fa-edit"></i> Sửa
                        </button>
                        <button class="btn btn-danger" onclick="deleteStandardSampleData(${item.id})" style="padding: 6px 12px; font-size: 0.85rem;">
                            <i class="fas fa-trash"></i> Xóa
                        </button>
                    </div>
                </td>
                <td></td>
            `;
            elementsTbody.appendChild(elementRow);
        });
        
        elementsTable.appendChild(elementsTbody);
        elementsCell.appendChild(elementsTable);
        elementsContainer.appendChild(elementsCell);
        tbody.appendChild(elementsContainer);
    });
}

function toggleSampleElements(sampleId) {
    const elementsRow = document.getElementById(`elements-${sampleId}`);
    const chevron = document.getElementById(`chevron-${sampleId}`);
    
    if (elementsRow.style.display === 'none') {
        elementsRow.style.display = '';
        chevron.classList.remove('fa-chevron-right');
        chevron.classList.add('fa-chevron-down');
    } else {
        elementsRow.style.display = 'none';
        chevron.classList.remove('fa-chevron-down');
        chevron.classList.add('fa-chevron-right');
    }
}

function filterStandardSampleData() {
    const nameFilter = document.getElementById('standard-sample-name-filter').value.toLowerCase();
    const elementFilter = document.getElementById('standard-sample-element-filter').value.toLowerCase();
    const tbody = document.getElementById('standard-sample-tbody');
    const rows = tbody.querySelectorAll('tr');

    rows.forEach(row => {
        if (row.classList.contains('sample-header-row')) {
            // Row header của mẫu chuẩn
            const sampleName = row.textContent.toLowerCase();
            const elementsRow = row.nextElementSibling;
            
            if (sampleName.includes(nameFilter)) {
                // Kiểm tra các nguyên tố bên trong
                let hasMatchingElement = true;
                if (elementFilter) {
                    hasMatchingElement = false;
                    if (elementsRow && elementsRow.classList.contains('sample-elements-row')) {
                        const elementRows = elementsRow.querySelectorAll('tbody tr');
                        elementRows.forEach(elRow => {
                            const elementText = elRow.textContent.toLowerCase();
                            if (elementText.includes(elementFilter)) {
                                hasMatchingElement = true;
                            }
                        });
                    }
                }
                
                if (hasMatchingElement) {
                    row.style.display = '';
                    // Nếu có filter element, chỉ hiển thị các dòng nguyên tố phù hợp
                    if (elementFilter && elementsRow) {
                        const elementRows = elementsRow.querySelectorAll('tbody tr');
                        elementRows.forEach(elRow => {
                            const elementText = elRow.textContent.toLowerCase();
                            elRow.style.display = elementText.includes(elementFilter) ? '' : 'none';
                        });
                    }
                } else {
                    row.style.display = 'none';
                    if (elementsRow) {
                        elementsRow.style.display = 'none';
                    }
                }
            } else {
                row.style.display = 'none';
                if (elementsRow) {
                    elementsRow.style.display = 'none';
                }
            }
        } else if (row.classList.contains('sample-elements-row')) {
            // Row chứa các nguyên tố - đã được xử lý ở trên
            // Không cần xử lý riêng
        }
    });
}

function setupStandardSampleFileUpload() {
    const uploadArea = document.getElementById('standard-sample-upload-area');
    const fileInput = document.getElementById('standard-sample-csv-file');
    const fileLink = uploadArea.querySelector('.file-link');

    uploadArea.addEventListener('click', () => {
        fileInput.click();
    });

    fileLink.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.click();
    });

    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        
        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].name.endsWith('.csv')) {
            fileInput.files = files;
            handleStandardSampleFileSelect({ target: fileInput });
        } else {
            showToast('Vui lòng chọn file CSV', 'error');
        }
    });
}

function handleStandardSampleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        const fileInfo = document.getElementById('standard-sample-file-info');
        fileInfo.textContent = `Đã chọn: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`;
    }
}

document.getElementById('standard-sample-upload-form').addEventListener('submit', async function(e) {
    e.preventDefault();

    const fileInput = document.getElementById('standard-sample-csv-file');
    const file = fileInput.files[0];

    if (!file) {
        showToast('Vui lòng chọn file CSV', 'error');
        return;
    }

    if (!file.name.endsWith('.csv')) {
        showToast('File phải có định dạng CSV', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('/api/standard-sample/data/upload', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        if (result.success) {
            showToast(result.message);
            loadStandardSampleData();
            document.getElementById('standard-sample-upload-form').reset();
            document.getElementById('standard-sample-file-info').textContent = '';
        } else {
            showToast('Lỗi: ' + result.error, 'error');
        }
    } catch (error) {
        showToast('Lỗi kết nối: ' + error.message, 'error');
    }
});

async function downloadStandardSampleTemplate() {
    try {
        const response = await fetch('/api/standard-sample/data/template');
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'standard_sample_data_template.csv';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            showToast('Đã tải file mẫu thành công');
        } else {
            const result = await response.json();
            showToast('Lỗi: ' + result.error, 'error');
        }
    } catch (error) {
        showToast('Lỗi kết nối: ' + error.message, 'error');
    }
}

async function downloadStandardSampleData() {
    try {
        const response = await fetch('/api/standard-sample/data/download');
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'standard_sample_data.csv';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            showToast('Đã tải dữ liệu thành công');
        } else {
            const result = await response.json();
            showToast('Lỗi: ' + result.error, 'error');
        }
    } catch (error) {
        showToast('Lỗi kết nối: ' + error.message, 'error');
    }
}

let editingStandardSampleId = null;

function showStandardSampleModal(id = null, presetSampleName = null) {
    editingStandardSampleId = id;
    const modal = document.getElementById('standard-sample-modal');
    const form = document.getElementById('standard-sample-form');
    const title = document.getElementById('standard-sample-modal-title');

    if (id !== null) {
        title.textContent = 'Sửa Dữ liệu Mẫu chuẩn';
        const data = standardSampleData.find(d => d.id === id);
        if (data) {
            document.getElementById('standard-sample-id').value = data.id;
            document.getElementById('standard-sample-name').value = data.sample_name || '';
            document.getElementById('standard-sample-element').value = data.element || '';
            document.getElementById('standard-sample-concentration').value = data.concentration !== null && data.concentration !== undefined ? data.concentration : '';
            document.getElementById('standard-sample-uncertainty').value = data.uncertainty !== null && data.uncertainty !== undefined ? data.uncertainty : '';
        }
    } else {
        title.textContent = 'Thêm Nguyên tố vào Mẫu chuẩn';
        form.reset();
        document.getElementById('standard-sample-id').value = '';
        // Nếu có presetSampleName, điền sẵn tên mẫu chuẩn
        if (presetSampleName) {
            document.getElementById('standard-sample-name').value = presetSampleName;
        }
        // Đảm bảo datalist đã được load
        loadStandardSampleNames();
    }

    modal.classList.add('active');
}

function closeStandardSampleModal() {
    document.getElementById('standard-sample-modal').classList.remove('active');
    editingStandardSampleId = null;
}

document.getElementById('standard-sample-form').addEventListener('submit', async function(e) {
    e.preventDefault();

    const data = {
        sample_name: document.getElementById('standard-sample-name').value,
        element: document.getElementById('standard-sample-element').value,
        concentration: document.getElementById('standard-sample-concentration').value || null,
        uncertainty: document.getElementById('standard-sample-uncertainty').value || null
    };

    try {
        const id = editingStandardSampleId;
        const url = id !== null ? `/api/standard-sample/data/${id}` : '/api/standard-sample/data';
        const method = id !== null ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();
        if (result.success) {
            showToast(result.message);
            const sampleName = document.getElementById('standard-sample-name').value;
            closeStandardSampleModal();
            await loadStandardSampleData();
            // Tự động mở mẫu chuẩn sau khi thêm/sửa
            if (sampleName) {
                const sampleId = `sample-${sampleName.replace(/\s+/g, '-').toLowerCase()}`;
                const elementsRow = document.getElementById(`elements-${sampleId}`);
                if (elementsRow && elementsRow.style.display === 'none') {
                    toggleSampleElements(sampleId);
                }
            }
        } else {
            showToast('Lỗi: ' + result.error, 'error');
        }
    } catch (error) {
        showToast('Lỗi kết nối: ' + error.message, 'error');
    }
});

async function editStandardSampleData(id) {
    showStandardSampleModal(id);
}

async function deleteStandardSampleData(id) {
    if (!confirm('Bạn có chắc chắn muốn xóa dữ liệu mẫu chuẩn này?')) {
        return;
    }

    try {
        const response = await fetch(`/api/standard-sample/data/${id}`, {
            method: 'DELETE'
        });

        const result = await response.json();
        if (result.success) {
            showToast(result.message);
            loadStandardSampleData();
        } else {
            showToast('Lỗi: ' + result.error, 'error');
        }
    } catch (error) {
        showToast('Lỗi kết nối: ' + error.message, 'error');
    }
}

async function editSampleName(sampleName) {
    const newName = prompt(`Đổi tên mẫu chuẩn "${sampleName}" thành:`, sampleName);
    if (newName === null || newName.trim() === '') {
        return;
    }
    
    if (newName.trim() === sampleName) {
        return;
    }

    try {
        const response = await fetch(`/api/standard-sample/sample/${encodeURIComponent(sampleName)}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ new_name: newName.trim() })
        });

        const result = await response.json();
        if (result.success) {
            showToast(result.message);
            loadStandardSampleData();
        } else {
            showToast('Lỗi: ' + result.error, 'error');
        }
    } catch (error) {
        showToast('Lỗi kết nối: ' + error.message, 'error');
    }
}

async function deleteSample(sampleName) {
    const confirmMessage = `Bạn có chắc chắn muốn xóa toàn bộ mẫu chuẩn "${sampleName}"?\n\n` +
                          `⚠️ CẢNH BÁO: Tất cả các nguyên tố của mẫu chuẩn này sẽ bị xóa.`;
    
    if (!confirm(confirmMessage)) {
        return;
    }

    try {
        const response = await fetch(`/api/standard-sample/sample/${encodeURIComponent(sampleName)}`, {
            method: 'DELETE'
        });

        const result = await response.json();
        if (result.success) {
            showToast(result.message);
            loadStandardSampleData();
        } else {
            showToast('Lỗi: ' + result.error, 'error');
        }
    } catch (error) {
        showToast('Lỗi kết nối: ' + error.message, 'error');
    }
}

// ========== Irradiated Container and Sample Functions ==========

let irradiatedContainers = [];
let irradiatedSamples = [];
let editingIrradiatedContainerId = null;
let editingIrradiatedSampleId = null;

async function loadIrradiatedData() {
    try {
        // Load containers
        const containerResponse = await fetch('/api/irradiated/containers');
        const containerResult = await containerResponse.json();
        if (containerResult.success) {
            irradiatedContainers = containerResult.data;
            document.getElementById('irradiated-container-count').textContent = containerResult.count || 0;
        }
        
        // Load samples
        const sampleResponse = await fetch('/api/irradiated/samples');
        const sampleResult = await sampleResponse.json();
        if (sampleResult.success) {
            irradiatedSamples = sampleResult.data;
            document.getElementById('irradiated-sample-count').textContent = sampleResult.count || 0;
        }
        
        spectrumDecayCache = new Map();
        
        renderIrradiatedTable();
        loadContainerNames();
    } catch (error) {
        showToast('Lỗi kết nối: ' + error.message, 'error');
    }
}

function renderIrradiatedTable() {
    const tbody = document.getElementById('irradiated-tbody');
    tbody.innerHTML = '';

    if (irradiatedContainers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px; color: var(--text-secondary);">Chưa có dữ liệu. Hãy thêm container chiếu mới.</td></tr>';
        return;
    }

    // Nhóm mẫu theo container
    const groupedSamples = {};
    irradiatedSamples.forEach(sample => {
        const containerName = sample.container_name || 'Không tên';
        if (!groupedSamples[containerName]) {
            groupedSamples[containerName] = [];
        }
        groupedSamples[containerName].push(sample);
    });

    const formatValue = (value, formatFunc = null) => {
        if (value === null || value === undefined || value === '') {
            return '<span style="color: #94a3b8; font-style: italic;">-</span>';
        }
        if (formatFunc) {
            try {
                return formatFunc(value);
            } catch (e) {
                return value;
            }
        }
        return value;
    };

    // Render từng container
    irradiatedContainers.forEach(container => {
        const containerName = container.container_name || 'Không tên';
        const samples = groupedSamples[containerName] || [];
        const containerId = `container-${containerName.replace(/\s+/g, '-').toLowerCase()}`;
        
        // Row chính cho container
        const mainRow = document.createElement('tr');
        mainRow.className = 'container-header-row';
        mainRow.id = containerId;
        mainRow.innerHTML = `
            <td colspan="2" style="background: var(--bg-color); font-weight: 700; cursor: pointer;" onclick="toggleContainerSamples('${containerId}')">
                <i class="fas fa-chevron-right container-chevron" id="chevron-${containerId}"></i>
                <strong>${containerName}</strong>
                <span style="color: var(--text-secondary); font-weight: normal; margin-left: 10px;">
                    (${samples.length} mẫu)
                </span>
            </td>
            <td style="background: var(--bg-color);">${formatValue(container.irradiation_position)}</td>
            <td style="background: var(--bg-color);">
                ${formatDateTime(container.start_time)} - ${formatDateTime(container.end_time)}
            </td>
            <td colspan="2" style="background: var(--bg-color);">
                <div class="action-buttons">
                    <button class="btn btn-primary" onclick="event.stopPropagation(); showIrradiatedSampleModal(null, '${containerName}')" style="padding: 6px 12px; font-size: 0.9rem;">
                        <i class="fas fa-plus"></i> Thêm mẫu
                    </button>
                    <button class="btn btn-edit" onclick="event.stopPropagation(); editIrradiatedContainer(${container.id})" style="padding: 6px 12px; font-size: 0.9rem;">
                        <i class="fas fa-edit"></i> Sửa
                    </button>
                    <button class="btn btn-danger" onclick="event.stopPropagation(); deleteIrradiatedContainer(${container.id})" style="padding: 6px 12px; font-size: 0.9rem;">
                        <i class="fas fa-trash"></i> Xóa
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(mainRow);

        // Container cho các mẫu (ẩn mặc định)
        const samplesContainer = document.createElement('tr');
        samplesContainer.className = 'container-samples-row';
        samplesContainer.id = `samples-${containerId}`;
        samplesContainer.style.display = 'none';
        
        const samplesCell = document.createElement('td');
        samplesCell.colSpan = 6;
        samplesCell.style.padding = '0';
        samplesCell.style.background = '#fafafa';
        
        const samplesTable = document.createElement('table');
        samplesTable.style.width = '100%';
        samplesTable.style.borderCollapse = 'collapse';
        
        const samplesTbody = document.createElement('tbody');
        
        if (samples.length === 0) {
            const emptyRow = document.createElement('tr');
            emptyRow.innerHTML = '<td colspan="6" style="padding: 20px; text-align: center; color: var(--text-secondary);">Chưa có mẫu trong container này</td>';
            samplesTbody.appendChild(emptyRow);
        } else {
            samples.forEach(sample => {
                const sampleRow = document.createElement('tr');
                sampleRow.style.borderTop = '1px solid var(--border-color)';
                sampleRow.innerHTML = `
                    <td style="padding: 12px; width: 60px; text-align: center;">${sample.id}</td>
                    <td style="padding: 12px; padding-left: 40px;">
                        <i class="fas fa-circle" style="font-size: 0.5rem; color: var(--primary-color); margin-right: 10px;"></i>
                        <strong>${sample.sample_name || '-'}</strong> / ${sample.spectrum_name || '-'}
                    </td>
                    <td style="padding: 12px;">${formatValue(sample.position_in_container)}</td>
                    <td style="padding: 12px;">
                        <div><strong>Bắt đầu đo:</strong> ${formatDateTime(sample.measurement_start_time)}</div>
                        <div style="margin-top: 5px;"><strong>Thời gian đo:</strong> ${formatValue(sample.measurement_duration, v => v + 's')}</div>
                    </td>
                    <td style="padding: 12px;">
                        <div class="action-buttons">
                            <button class="btn btn-edit" onclick="editIrradiatedSample(${sample.id})" style="padding: 6px 12px; font-size: 0.85rem;">
                                <i class="fas fa-edit"></i> Sửa
                            </button>
                            <button class="btn btn-danger" onclick="deleteIrradiatedSample(${sample.id})" style="padding: 6px 12px; font-size: 0.85rem;">
                                <i class="fas fa-trash"></i> Xóa
                            </button>
                        </div>
                    </td>
                    <td style="padding: 12px;">${formatValue(sample.sample_mass, v => v.toFixed(4) + ' g')}</td>
                `;
                samplesTbody.appendChild(sampleRow);
            });
        }
        
        samplesTable.appendChild(samplesTbody);
        samplesCell.appendChild(samplesTable);
        samplesContainer.appendChild(samplesCell);
        tbody.appendChild(samplesContainer);
    });
}

function toggleContainerSamples(containerId) {
    const samplesRow = document.getElementById(`samples-${containerId}`);
    const chevron = document.getElementById(`chevron-${containerId}`);
    
    if (samplesRow.style.display === 'none') {
        samplesRow.style.display = '';
        chevron.classList.remove('fa-chevron-right');
        chevron.classList.add('fa-chevron-down');
    } else {
        samplesRow.style.display = 'none';
        chevron.classList.remove('fa-chevron-down');
        chevron.classList.add('fa-chevron-right');
    }
}

function filterIrradiatedData() {
    const filter = document.getElementById('irradiated-container-filter').value.toLowerCase();
    const tbody = document.getElementById('irradiated-tbody');
    const rows = tbody.querySelectorAll('tr');

    rows.forEach(row => {
        if (row.classList.contains('container-header-row')) {
            const containerName = row.textContent.toLowerCase();
            const samplesRow = row.nextElementSibling;
            
            if (containerName.includes(filter)) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
                if (samplesRow) {
                    samplesRow.style.display = 'none';
                }
            }
        }
    });
}

function setupIrradiatedFileUpload() {
    // Tránh gắn listener nhiều lần
    if (irradiatedUploadInitialized) {
        return;
    }

    const uploadArea = document.getElementById('irradiated-upload-area');
    const fileInput = document.getElementById('irradiated-csv-file');
    
    if (!uploadArea || !fileInput) {
        // Elements not found, try again later
        setTimeout(setupIrradiatedFileUpload, 100);
        return;
    }

    // Đánh dấu đã khởi tạo sau khi chắc chắn có đủ phần tử
    irradiatedUploadInitialized = true;
    
    const fileLink = uploadArea.querySelector('.file-link');

    if (uploadArea) {
        uploadArea.addEventListener('click', (e) => {
            // Don't trigger if clicking on the file link directly
            if (e.target !== fileLink) {
                fileInput.click();
            }
        });
    }

    if (fileLink) {
        fileLink.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            fileInput.click();
        });
    }

    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        
        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].name.endsWith('.csv')) {
            fileInput.files = files;
            handleIrradiatedFileSelect({ target: fileInput });
        } else {
            showToast('Vui lòng chọn file CSV', 'error');
        }
    });
}

function handleSpeFileSelect(event) {
    const fileInput = event.target;
    const fileInfo = document.getElementById('spe-file-info');
    const uploadArea = document.getElementById('spe-upload-area');
    
    if (fileInput.files && fileInput.files.length > 0) {
        const fileCount = fileInput.files.length;
        const fileNames = Array.from(fileInput.files).map(f => f.name).join(', ');
        fileInfo.textContent = `Đã chọn ${fileCount} file .Spe: ${fileNames}`;
        fileInfo.style.color = 'var(--primary-color)';
        fileInfo.style.fontWeight = '600';
        uploadArea.style.borderColor = 'var(--primary-color)';
    } else {
        fileInfo.textContent = '';
        uploadArea.style.borderColor = '';
    }
}

function handleIrradiatedFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        const fileInfo = document.getElementById('irradiated-file-info');
        if (fileInfo) {
            fileInfo.textContent = `Đã chọn: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`;
        }
    }
}

// Setup form submit handler
function setupIrradiatedFormSubmit() {
    // Tránh gắn listener nhiều lần
    if (irradiatedFormInitialized) {
        return;
    }

    const form = document.getElementById('irradiated-upload-form');
    if (!form) {
        // Form not found, try again later
        setTimeout(setupIrradiatedFormSubmit, 100);
        return;
    }

    // Đánh dấu đã khởi tạo sau khi chắc chắn có form
    irradiatedFormInitialized = true;
    
    form.addEventListener('submit', async function(e) {
        e.preventDefault();

        const fileInput = document.getElementById('irradiated-csv-file');
        if (!fileInput) {
            showToast('Không tìm thấy input file', 'error');
            return;
        }
        
        const file = fileInput.files[0];

        if (!file) {
            showToast('Vui lòng chọn file CSV', 'error');
            return;
        }

        if (!file.name.endsWith('.csv')) {
            showToast('File phải có định dạng CSV', 'error');
            return;
        }

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/api/irradiated/data/upload', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();
            if (result.success) {
                showToast(result.message);
                loadIrradiatedData();
                form.reset();
                const fileInfo = document.getElementById('irradiated-file-info');
                if (fileInfo) {
                    fileInfo.textContent = '';
                }
            } else {
                showToast('Lỗi: ' + result.error, 'error');
            }
        } catch (error) {
            showToast('Lỗi kết nối: ' + error.message, 'error');
        }
    });
}

// Setup .Spe file form submit handler
function setupSpeFormSubmit() {
    const form = document.getElementById('spe-process-form');
    if (!form) {
        setTimeout(setupSpeFormSubmit, 100);
        return;
    }
    
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const fileInput = document.getElementById('spe-files');
        if (!fileInput) {
            showToast('Không tìm thấy input file', 'error');
            return;
        }
        
        const files = fileInput.files;
        if (!files || files.length === 0) {
            showToast('Vui lòng chọn ít nhất một file .Spe', 'error');
            return;
        }
        
        // Kiểm tra tất cả file đều là .Spe
        const invalidFiles = Array.from(files).filter(f => !f.name.toLowerCase().endsWith('.spe'));
        if (invalidFiles.length > 0) {
            showToast('Tất cả file phải có định dạng .Spe', 'error');
            return;
        }
        
        const formData = new FormData();
        for (let i = 0; i < files.length; i++) {
            formData.append('files', files[i]);
        }
        
        const containerNameInput = document.getElementById('spe-container-name');
        const irradiationPositionInput = document.getElementById('spe-irradiation-position');
        const irradiationStartTimeInput = document.getElementById('spe-irradiation-start-time');
        const irradiationEndTimeInput = document.getElementById('spe-irradiation-end-time');
        
        const containerNameValue = containerNameInput ? containerNameInput.value : '';
        const irradiationPositionValue = irradiationPositionInput ? irradiationPositionInput.value : '';
        const irradiationStartTimeValue = irradiationStartTimeInput ? irradiationStartTimeInput.value : '';
        const irradiationEndTimeValue = irradiationEndTimeInput ? irradiationEndTimeInput.value : '';
        
        if (irradiationStartTimeValue && irradiationEndTimeValue) {
            const start = new Date(irradiationStartTimeValue);
            const end = new Date(irradiationEndTimeValue);
            if (start > end) {
                showToast('Thời gian bắt đầu chiếu phải nhỏ hơn hoặc bằng thời gian kết thúc chiếu', 'error');
                return;
            }
        }
        
        formData.append('container_name', containerNameValue || '');
        formData.append('irradiation_position', irradiationPositionValue || '');
        formData.append('irradiation_start_time', irradiationStartTimeValue || '');
        formData.append('irradiation_end_time', irradiationEndTimeValue || '');
        
        try {
            showToast('Đang xử lý file .Spe...', 'info');
            
            const response = await fetch('/api/irradiated/process-spe-files', {
                method: 'POST',
                body: formData
            });
            
            if (response.ok) {
                // Download file CSV
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'irradiated_data_from_spe.csv';
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                
                showToast(`Đã xử lý ${files.length} file .Spe và tải CSV thành công! Vui lòng điền thêm các thông tin khác và import vào hệ thống.`);
                form.reset();
                const fileInfo = document.getElementById('spe-file-info');
                if (fileInfo) {
                    fileInfo.textContent = '';
                }
                const uploadArea = document.getElementById('spe-upload-area');
                if (uploadArea) {
                    uploadArea.style.borderColor = '';
                }
            } else {
                const result = await response.json();
                showToast('Lỗi: ' + (result.error || 'Không thể xử lý file .Spe'), 'error');
            }
        } catch (error) {
            showToast('Lỗi kết nối: ' + error.message, 'error');
        }
    });
}

// Setup drag and drop for .Spe files
function setupSpeDragAndDrop() {
    const uploadArea = document.getElementById('spe-upload-area');
    const fileInput = document.getElementById('spe-files');
    
    if (!uploadArea || !fileInput) {
        setTimeout(setupSpeDragAndDrop, 100);
        return;
    }
    
    uploadArea.addEventListener('click', function() {
        fileInput.click();
    });
    
    uploadArea.addEventListener('dragover', function(e) {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });
    
    uploadArea.addEventListener('dragleave', function(e) {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
    });
    
    uploadArea.addEventListener('drop', function(e) {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        
        const files = Array.from(e.dataTransfer.files).filter(f => f.name.toLowerCase().endsWith('.spe'));
        if (files.length > 0) {
            const dataTransfer = new DataTransfer();
            files.forEach(file => dataTransfer.items.add(file));
            fileInput.files = dataTransfer.files;
            handleSpeFileSelect({ target: fileInput });
        } else {
            showToast('Vui lòng kéo thả file .Spe', 'error');
        }
    });
}

async function downloadIrradiatedTemplate() {
    try {
        const response = await fetch('/api/irradiated/data/template');
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'irradiated_data_template.csv';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            showToast('Đã tải file mẫu thành công');
        } else {
            const result = await response.json();
            showToast('Lỗi: ' + result.error, 'error');
        }
    } catch (error) {
        showToast('Lỗi kết nối: ' + error.message, 'error');
    }
}

async function downloadIrradiatedData() {
    // TODO: Implement export to CSV
    showToast('Tính năng export CSV đang được phát triển', 'info');
}

async function showIrradiatedContainerModal(id = null) {
    editingIrradiatedContainerId = id;
    const modal = document.getElementById('irradiated-container-modal');
    const form = document.getElementById('irradiated-container-form');
    const title = document.getElementById('irradiated-container-modal-title');

    // Show modal first
    modal.classList.add('active');

    // Load irradiation positions before populating form
    await loadIrradiationPositions();
    
    // Wait a bit to ensure select is populated
    await new Promise(resolve => setTimeout(resolve, 100));

    if (id !== null) {
        title.textContent = 'Sửa Container Chiếu';
        const container = irradiatedContainers.find(c => c.id === id);
        if (container) {
            document.getElementById('irradiated-container-id').value = container.id;
            document.getElementById('irradiated-container-name').value = container.container_name || '';
            
            // Set irradiation position
            const positionSelect = document.getElementById('irradiated-irradiation-position');
            if (positionSelect) {
                const positionValue = container.irradiation_position || '';
                // Check if the value exists in options
                const optionExists = Array.from(positionSelect.options).some(opt => opt.value === positionValue);
                if (optionExists) {
                    positionSelect.value = positionValue;
                } else if (positionValue) {
                    // If value doesn't exist, add it as a temporary option (for backward compatibility)
                    const option = document.createElement('option');
                    option.value = positionValue;
                    option.textContent = positionValue + ' (không còn trong danh sách)';
                    option.style.color = 'red';
                    positionSelect.appendChild(option);
                    positionSelect.value = positionValue;
                } else {
                    positionSelect.value = '';
                }
            }
            
            // Convert từ dd/mm/yyyy HH:mm:ss sang datetime-local format (yyyy-mm-ddThh:mm)
            const convertToDatetimeLocal = (dtStr) => {
                if (!dtStr) return '';
                try {
                    // Parse định dạng dd/mm/yyyy HH:mm:ss
                    const match = dtStr.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/);
                    if (match) {
                        const [, day, month, year, hour, minute] = match;
                        return `${year}-${month}-${day}T${hour}:${minute}`;
                    }
                    // Thử parse với Date object
                    const dt = new Date(dtStr);
                    if (!isNaN(dt.getTime())) {
                        const y = dt.getFullYear();
                        const m = String(dt.getMonth() + 1).padStart(2, '0');
                        const d = String(dt.getDate()).padStart(2, '0');
                        const h = String(dt.getHours()).padStart(2, '0');
                        const min = String(dt.getMinutes()).padStart(2, '0');
                        return `${y}-${m}-${d}T${h}:${min}`;
                    }
                } catch (e) {
                    // Ignore
                }
                return '';
            };
            
            const startTime = convertToDatetimeLocal(container.start_time);
            const endTime = convertToDatetimeLocal(container.end_time);
            document.getElementById('irradiated-start-time').value = startTime;
            document.getElementById('irradiated-end-time').value = endTime;
            
            document.getElementById('irradiated-container-note').value = container.note || '';
        }
    } else {
        title.textContent = 'Thêm Container Chiếu';
        // Reset form fields manually to preserve loaded dropdown options
        document.getElementById('irradiated-container-id').value = '';
        document.getElementById('irradiated-container-name').value = '';
        const positionSelect = document.getElementById('irradiated-irradiation-position');
        if (positionSelect) {
            positionSelect.value = '';
        }
        document.getElementById('irradiated-start-time').value = '';
        document.getElementById('irradiated-end-time').value = '';
        document.getElementById('irradiated-container-note').value = '';
    }
}

function closeIrradiatedContainerModal() {
    document.getElementById('irradiated-container-modal').classList.remove('active');
    editingIrradiatedContainerId = null;
}

document.getElementById('irradiated-container-form').addEventListener('submit', async function(e) {
    e.preventDefault();

    // Convert từ datetime-local (yyyy-mm-ddThh:mm) sang dd/mm/yyyy HH:mm:ss
    const convertFromDatetimeLocal = (dtLocalStr) => {
        if (!dtLocalStr) return '';
        try {
            const dt = new Date(dtLocalStr);
            if (!isNaN(dt.getTime())) {
                const day = String(dt.getDate()).padStart(2, '0');
                const month = String(dt.getMonth() + 1).padStart(2, '0');
                const year = dt.getFullYear();
                const hours = String(dt.getHours()).padStart(2, '0');
                const minutes = String(dt.getMinutes()).padStart(2, '0');
                return `${day}/${month}/${year} ${hours}:${minutes}:00`;
            }
        } catch (e) {
            // Ignore
        }
        return '';
    };
    
    const data = {
        container_name: document.getElementById('irradiated-container-name').value,
        irradiation_position: document.getElementById('irradiated-irradiation-position').value,
        start_time: convertFromDatetimeLocal(document.getElementById('irradiated-start-time').value),
        end_time: convertFromDatetimeLocal(document.getElementById('irradiated-end-time').value),
        note: document.getElementById('irradiated-container-note').value || ''
    };

    try {
        const id = editingIrradiatedContainerId;
        const url = id !== null ? `/api/irradiated/containers/${id}` : '/api/irradiated/containers';
        const method = id !== null ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();
        if (result.success) {
            showToast(result.message);
            closeIrradiatedContainerModal();
            loadIrradiatedData();
        } else {
            showToast('Lỗi: ' + result.error, 'error');
        }
    } catch (error) {
        showToast('Lỗi kết nối: ' + error.message, 'error');
    }
});

async function editIrradiatedContainer(id) {
    showIrradiatedContainerModal(id);
}

async function deleteIrradiatedContainer(id) {
    const confirmMessage = `Bạn có chắc chắn muốn xóa container này?\n\n` +
                          `⚠️ CẢNH BÁO: Tất cả các mẫu trong container này sẽ bị xóa.`;
    
    if (!confirm(confirmMessage)) {
        return;
    }

    try {
        const response = await fetch(`/api/irradiated/containers/${id}`, {
            method: 'DELETE'
        });

        const result = await response.json();
        if (result.success) {
            showToast(result.message);
            loadIrradiatedData();
        } else {
            showToast('Lỗi: ' + result.error, 'error');
        }
    } catch (error) {
        showToast('Lỗi kết nối: ' + error.message, 'error');
    }
}

function loadContainerNames() {
    const datalist = document.getElementById('container-names-list');
    datalist.innerHTML = '';
    irradiatedContainers.forEach(container => {
        const option = document.createElement('option');
        option.value = container.container_name;
        datalist.appendChild(option);
    });
}

async function showIrradiatedSampleModal(id = null, presetContainerName = null) {
    editingIrradiatedSampleId = id;
    const modal = document.getElementById('irradiated-sample-modal');
    const form = document.getElementById('irradiated-sample-form');
    const title = document.getElementById('irradiated-sample-modal-title');

    if (id !== null) {
        title.textContent = 'Sửa Mẫu đã chiếu';
        const sample = irradiatedSamples.find(s => s.id === id);
        if (sample) {
            document.getElementById('irradiated-sample-id').value = sample.id;
            document.getElementById('irradiated-sample-container-name').value = sample.container_name || '';
            document.getElementById('irradiated-sample-name').value = sample.sample_name || '';
            document.getElementById('irradiated-spectrum-name').value = sample.spectrum_name || '';
            document.getElementById('irradiated-position-in-container').value = sample.position_in_container || '';
            
            // Convert từ dd/mm/yyyy HH:mm:ss sang datetime-local format
            const convertToDatetimeLocal = (dtStr) => {
                if (!dtStr) return '';
                try {
                    // Parse định dạng dd/mm/yyyy HH:mm:ss
                    const match = dtStr.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/);
                    if (match) {
                        const [, day, month, year, hour, minute] = match;
                        return `${year}-${month}-${day}T${hour}:${minute}`;
                    }
                    // Thử parse với Date object
                    const dt = new Date(dtStr);
                    if (!isNaN(dt.getTime())) {
                        const y = dt.getFullYear();
                        const m = String(dt.getMonth() + 1).padStart(2, '0');
                        const d = String(dt.getDate()).padStart(2, '0');
                        const h = String(dt.getHours()).padStart(2, '0');
                        const min = String(dt.getMinutes()).padStart(2, '0');
                        return `${y}-${m}-${d}T${h}:${min}`;
                    }
                } catch (e) {
                    // Ignore
                }
                return '';
            };
            
            const startTime = convertToDatetimeLocal(sample.measurement_start_time);
            document.getElementById('irradiated-measurement-start-time').value = startTime;
            
            document.getElementById('irradiated-measurement-duration').value = sample.measurement_duration !== null && sample.measurement_duration !== undefined ? sample.measurement_duration : '';
            document.getElementById('irradiated-sample-mass').value = sample.sample_mass !== null && sample.sample_mass !== undefined ? sample.sample_mass : '';
            document.getElementById('irradiated-sample-is-monitor').checked = sample.is_monitor || false;
            document.getElementById('irradiated-sample-is-standard-sample').checked = sample.is_standard_sample || false;
            if (sample.is_standard_sample) {
                await loadIrradiatedStandardSampleNames();
                document.getElementById('irradiated-sample-standard-sample-group').style.display = 'block';
                document.getElementById('irradiated-sample-standard-sample-name').required = true;
                document.getElementById('irradiated-sample-standard-sample-name').value = sample.standard_sample_name || '';
            } else {
                document.getElementById('irradiated-sample-standard-sample-group').style.display = 'none';
                document.getElementById('irradiated-sample-standard-sample-name').required = false;
            }
        }
    } else {
        title.textContent = 'Thêm Mẫu đã chiếu';
        form.reset();
        document.getElementById('irradiated-sample-id').value = '';
        document.getElementById('irradiated-sample-is-monitor').checked = false;
        document.getElementById('irradiated-sample-is-standard-sample').checked = false;
        document.getElementById('irradiated-sample-standard-sample-name').value = '';
        document.getElementById('irradiated-sample-standard-sample-group').style.display = 'none';
        if (presetContainerName) {
            document.getElementById('irradiated-sample-container-name').value = presetContainerName;
        }
        loadContainerNames();
        await loadIrradiatedStandardSampleNames();
    }

    modal.classList.add('active');
}

function closeIrradiatedSampleModal() {
    document.getElementById('irradiated-sample-modal').classList.remove('active');
    editingIrradiatedSampleId = null;
}

function setupIrradiatedSampleFormSubmit() {
    const form = document.getElementById('irradiated-sample-form');
    if (!form) {
        setTimeout(setupIrradiatedSampleFormSubmit, 100);
        return;
    }
    
    // Check if listener already added
    if (form.hasAttribute('data-listener-added')) {
        return;
    }
    form.setAttribute('data-listener-added', 'true');
    
    form.addEventListener('submit', async function(e) {
        e.preventDefault();

        // Convert từ datetime-local (yyyy-mm-ddThh:mm) sang dd/mm/yyyy HH:mm:ss
        const convertFromDatetimeLocal = (dtLocalStr) => {
            if (!dtLocalStr) return '';
            try {
                const dt = new Date(dtLocalStr);
                if (!isNaN(dt.getTime())) {
                    const day = String(dt.getDate()).padStart(2, '0');
                    const month = String(dt.getMonth() + 1).padStart(2, '0');
                    const year = dt.getFullYear();
                    const hours = String(dt.getHours()).padStart(2, '0');
                    const minutes = String(dt.getMinutes()).padStart(2, '0');
                    return `${day}/${month}/${year} ${hours}:${minutes}:00`;
                }
            } catch (e) {
                // Ignore
            }
            return '';
        };
        
        const isStandardSample = document.getElementById('irradiated-sample-is-standard-sample').checked;
        const standardSampleName = document.getElementById('irradiated-sample-standard-sample-name').value;
        
        // Validate: if is_standard_sample is checked, standard_sample_name must be provided
        if (isStandardSample && !standardSampleName) {
            showToast('Vui lòng chọn tên mẫu chuẩn', 'error');
            return;
        }
        
        const data = {
            container_name: document.getElementById('irradiated-sample-container-name').value,
            sample_name: document.getElementById('irradiated-sample-name').value,
            spectrum_name: document.getElementById('irradiated-spectrum-name').value,
            position_in_container: document.getElementById('irradiated-position-in-container').value || '',
            measurement_start_time: convertFromDatetimeLocal(document.getElementById('irradiated-measurement-start-time').value),
            measurement_duration: document.getElementById('irradiated-measurement-duration').value || null,
            sample_mass: document.getElementById('irradiated-sample-mass').value || null,
            is_monitor: document.getElementById('irradiated-sample-is-monitor').checked,
            is_standard_sample: isStandardSample,
            standard_sample_name: isStandardSample ? standardSampleName : ''
        };

        try {
            const id = editingIrradiatedSampleId;
            const url = id !== null ? `/api/irradiated/samples/${id}` : '/api/irradiated/samples';
            const method = id !== null ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });

            const result = await response.json();
            if (result.success) {
                showToast(result.message);
                const containerName = document.getElementById('irradiated-sample-container-name').value;
                closeIrradiatedSampleModal();
                await loadIrradiatedData();
                // Tự động mở container sau khi thêm/sửa
                if (containerName) {
                    const containerId = `container-${containerName.replace(/\s+/g, '-').toLowerCase()}`;
                    const samplesRow = document.getElementById(`samples-${containerId}`);
                    if (samplesRow && samplesRow.style.display === 'none') {
                        toggleContainerSamples(containerId);
                    }
                }
            } else {
                showToast('Lỗi: ' + result.error, 'error');
            }
        } catch (error) {
            showToast('Lỗi kết nối: ' + error.message, 'error');
        }
    });
}

async function editIrradiatedSample(id) {
    showIrradiatedSampleModal(id);
}

async function deleteIrradiatedSample(id) {
    if (!confirm('Bạn có chắc chắn muốn xóa mẫu này?')) {
        return;
    }

    try {
        const response = await fetch(`/api/irradiated/samples/${id}`, {
            method: 'DELETE'
        });

        const result = await response.json();
        if (result.success) {
            showToast(result.message);
            loadIrradiatedData();
        } else {
            showToast('Lỗi: ' + result.error, 'error');
        }
    } catch (error) {
        showToast('Lỗi kết nối: ' + error.message, 'error');
    }
}

// Close modal when clicking outside
window.onclick = function(event) {
    const reactorModal = document.getElementById('reactor-modal');
    const detectorModal = document.getElementById('detector-modal');
    const nuclearModal = document.getElementById('nuclear-modal');
    const standardSampleModal = document.getElementById('standard-sample-modal');
    const irradiatedContainerModal = document.getElementById('irradiated-container-modal');
    const irradiatedSampleModal = document.getElementById('irradiated-sample-modal');
    
    if (event.target === reactorModal) {
        closeReactorModal();
    }
    if (event.target === detectorModal) {
        closeDetectorModal();
    }
    if (event.target === nuclearModal) {
        closeNuclearDataModal();
    }
    if (event.target === standardSampleModal) {
        closeStandardSampleModal();
    }
    if (event.target === irradiatedContainerModal) {
        closeIrradiatedContainerModal();
    }
    if (event.target === irradiatedSampleModal) {
        closeIrradiatedSampleModal();
    }
    const peakAreaModal = document.getElementById('peak-area-modal');
    if (event.target === peakAreaModal) {
        closePeakAreaModal();
    }
}

// ========== Peak Area Data Functions ==========

async function loadPeakAreaData() {
    try {
        const response = await fetch('/api/peak-area/data');
        const result = await response.json();
        if (result.success) {
            peakAreaData = result.data;
            renderPeakAreaTable();
            document.getElementById('peak-area-count').textContent = result.count;
        } else {
            showToast('Lỗi khi tải dữ liệu: ' + result.error, 'error');
        }
    } catch (error) {
        showToast('Lỗi kết nối: ' + error.message, 'error');
    }
}

function renderPeakAreaTable() {
    const tbody = document.getElementById('peak-area-tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if (peakAreaData.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="8" style="text-align: center; padding: 40px; color: var(--text-secondary);">Chưa có dữ liệu</td>';
        tbody.appendChild(row);
        return;
    }
    
    // Nhóm dữ liệu theo container, sau đó theo spectrum
    const groupedByContainer = {};
    peakAreaData.forEach(item => {
        const containerName = item.container_name || 'Không tên';
        if (!groupedByContainer[containerName]) {
            groupedByContainer[containerName] = {};
        }
        const spectrumName = item.spectrum_name || 'Không tên';
        if (!groupedByContainer[containerName][spectrumName]) {
            groupedByContainer[containerName][spectrumName] = [];
        }
        groupedByContainer[containerName][spectrumName].push(item);
    });
    
    // Lấy danh sách container names đã sắp xếp
    const containerNames = Object.keys(groupedByContainer).sort();
    
    containerNames.forEach(containerName => {
        const containerId = `peak-container-${containerName.replace(/\s+/g, '-').toLowerCase()}`;
        const spectra = groupedByContainer[containerName];
        const spectrumNames = Object.keys(spectra).sort();
        const totalItems = peakAreaData.filter(item => item.container_name === containerName).length;
        
        // Row chính cho container
        const mainRow = document.createElement('tr');
        mainRow.className = 'container-header-row';
        mainRow.id = containerId;
        mainRow.innerHTML = `
            <td colspan="2" style="background: var(--bg-color); font-weight: 700; cursor: pointer;" onclick="togglePeakContainerSamples('${containerId}')">
                <i class="fas fa-chevron-right container-chevron" id="chevron-${containerId}"></i>
                <strong>${containerName}</strong>
                <span style="color: var(--text-secondary); font-weight: normal; margin-left: 10px;">
                    (${totalItems} bản ghi, ${spectrumNames.length} phổ)
                </span>
            </td>
            <td colspan="4" style="background: var(--bg-color);"></td>
            <td style="background: var(--bg-color); text-align: right; padding-right: 15px;">
                <button class="btn btn-danger" onclick="event.stopPropagation(); deletePeakAreaContainer('${containerName.replace(/'/g, "\\'")}')" style="padding: 6px 12px; font-size: 0.85rem;">
                    <i class="fas fa-trash"></i> Xóa container
                </button>
            </td>
        `;
        tbody.appendChild(mainRow);
        
        // Container cho các spectrum (ẩn mặc định)
        const spectraContainer = document.createElement('tr');
        spectraContainer.className = 'container-samples-row';
        spectraContainer.id = `samples-${containerId}`;
        spectraContainer.style.display = 'none';
        
        const spectraCell = document.createElement('td');
        spectraCell.colSpan = 7;
        spectraCell.style.padding = '0';
        spectraCell.style.background = '#fafafa';
        
        const spectraTable = document.createElement('table');
        spectraTable.style.width = '100%';
        spectraTable.style.borderCollapse = 'collapse';
        
        const spectraTbody = document.createElement('tbody');
        
        if (spectrumNames.length === 0) {
            const emptyRow = document.createElement('tr');
            emptyRow.innerHTML = '<td colspan="7" style="padding: 20px; text-align: center; color: var(--text-secondary);">Chưa có dữ liệu trong container này</td>';
            spectraTbody.appendChild(emptyRow);
        } else {
            spectrumNames.forEach(spectrumName => {
                const spectrumId = `peak-spectrum-${containerName.replace(/\s+/g, '-').toLowerCase()}-${spectrumName.replace(/\s+/g, '-').toLowerCase()}`;
                const items = spectra[spectrumName];
                
                // Row header cho spectrum
                const spectrumHeaderRow = document.createElement('tr');
                spectrumHeaderRow.className = 'spectrum-header-row';
                spectrumHeaderRow.style.borderTop = '1px solid var(--border-color)';
                spectrumHeaderRow.innerHTML = `
                    <td colspan="2" style="background: #f0f0f0; font-weight: 600; cursor: pointer; padding: 10px; padding-left: 30px;" onclick="togglePeakSpectrumItems('${spectrumId}')">
                        <i class="fas fa-chevron-right spectrum-chevron" id="chevron-${spectrumId}" style="font-size: 0.8rem;"></i>
                        <strong>${spectrumName}</strong>
                        <span style="color: var(--text-secondary); font-weight: normal; margin-left: 10px;">
                            (${items.length} bản ghi)
                        </span>
                    </td>
                    <td colspan="6" style="background: #f0f0f0;"></td>
                `;
                spectraTbody.appendChild(spectrumHeaderRow);
                
                // Container cho các items trong spectrum (ẩn mặc định)
                const itemsContainer = document.createElement('tr');
                itemsContainer.className = 'spectrum-items-row';
                itemsContainer.id = `items-${spectrumId}`;
                itemsContainer.style.display = 'none';
                
                const itemsCell = document.createElement('td');
                itemsCell.colSpan = 7;
                itemsCell.style.padding = '0';
                itemsCell.style.background = '#ffffff';
                
                const itemsTable = document.createElement('table');
                itemsTable.style.width = '100%';
                itemsTable.style.borderCollapse = 'collapse';
                
                const itemsTbody = document.createElement('tbody');
                
                items.forEach(item => {
                    const itemRow = document.createElement('tr');
                    itemRow.style.borderTop = '1px solid #e0e0e0';
                    itemRow.innerHTML = `
                        <td style="padding: 12px; width: 60px; text-align: center; padding-left: 50px;">${item.id}</td>
                        <td style="padding: 12px; padding-left: 20px;">
                            <i class="fas fa-circle" style="font-size: 0.4rem; color: var(--primary-color); margin-right: 8px;"></i>
                            ${item.container_name || '-'}
                        </td>
                        <td style="padding: 12px;">${item.spectrum_name || '-'}</td>
                        <td style="padding: 12px;">${item.element_name || '-'}</td>
                        <td style="padding: 12px;">${item.energy !== null && item.energy !== undefined ? item.energy.toFixed(2) : '-'}</td>
                        <td style="padding: 12px;">${item.peak_area !== null && item.peak_area !== undefined ? item.peak_area.toFixed(1) : '-'}</td>
                        <td style="padding: 12px;">${item.peak_area_error !== null && item.peak_area_error !== undefined ? item.peak_area_error.toFixed(1) : '-'}</td>
                        <td style="padding: 12px;">
                            <div class="action-buttons">
                                <button class="btn btn-edit" onclick="editPeakAreaData(${item.id})" style="padding: 6px 12px; font-size: 0.85rem;">
                                    <i class="fas fa-edit"></i> Sửa
                                </button>
                                <button class="btn btn-danger" onclick="deletePeakAreaData(${item.id})" style="padding: 6px 12px; font-size: 0.85rem;">
                                    <i class="fas fa-trash"></i> Xóa
                                </button>
                            </div>
                        </td>
                    `;
                    itemsTbody.appendChild(itemRow);
                });
                
                itemsTable.appendChild(itemsTbody);
                itemsCell.appendChild(itemsTable);
                itemsContainer.appendChild(itemsCell);
                spectraTbody.appendChild(itemsContainer);
            });
        }
        
        spectraTable.appendChild(spectraTbody);
        spectraCell.appendChild(spectraTable);
        spectraContainer.appendChild(spectraCell);
        tbody.appendChild(spectraContainer);
    });
}

function togglePeakContainerSamples(containerId) {
    const samplesRow = document.getElementById(`samples-${containerId}`);
    const chevron = document.getElementById(`chevron-${containerId}`);
    
    if (samplesRow.style.display === 'none') {
        samplesRow.style.display = '';
        chevron.classList.remove('fa-chevron-right');
        chevron.classList.add('fa-chevron-down');
    } else {
        samplesRow.style.display = 'none';
        chevron.classList.remove('fa-chevron-down');
        chevron.classList.add('fa-chevron-right');
    }
}

function togglePeakSpectrumItems(spectrumId) {
    const itemsRow = document.getElementById(`items-${spectrumId}`);
    const chevron = document.getElementById(`chevron-${spectrumId}`);
    
    if (itemsRow.style.display === 'none') {
        itemsRow.style.display = '';
        chevron.classList.remove('fa-chevron-right');
        chevron.classList.add('fa-chevron-down');
    } else {
        itemsRow.style.display = 'none';
        chevron.classList.remove('fa-chevron-down');
        chevron.classList.add('fa-chevron-right');
    }
}

function filterPeakAreaData() {
    const containerFilter = document.getElementById('peak-area-container-filter').value.toLowerCase();
    const spectrumFilter = document.getElementById('peak-area-spectrum-filter').value.toLowerCase();
    const tbody = document.getElementById('peak-area-tbody');
    const rows = tbody.querySelectorAll('tr');
    
    rows.forEach(row => {
        if (row.classList.contains('container-header-row')) {
            // Filter container rows
            const containerName = row.textContent.toLowerCase();
            const samplesRow = row.nextElementSibling;
            
            if (containerName.includes(containerFilter)) {
                row.style.display = '';
                // Also check spectrum filter if container matches
                if (spectrumFilter) {
                    // Check if any spectrum in this container matches
                    let hasMatchingSpectrum = false;
                    if (samplesRow && samplesRow.classList.contains('container-samples-row')) {
                        const spectrumRows = samplesRow.querySelectorAll('.spectrum-header-row');
                        spectrumRows.forEach(spectrumRow => {
                            const spectrumName = spectrumRow.textContent.toLowerCase();
                            if (spectrumName.includes(spectrumFilter)) {
                                hasMatchingSpectrum = true;
                                spectrumRow.style.display = '';
                                // Show items for matching spectrum
                                const itemsRow = spectrumRow.nextElementSibling;
                                if (itemsRow && itemsRow.classList.contains('spectrum-items-row')) {
                                    itemsRow.style.display = '';
                                }
                            } else {
                                spectrumRow.style.display = 'none';
                                const itemsRow = spectrumRow.nextElementSibling;
                                if (itemsRow && itemsRow.classList.contains('spectrum-items-row')) {
                                    itemsRow.style.display = 'none';
                                }
                            }
                        });
                    }
                    if (!hasMatchingSpectrum && spectrumFilter) {
                        row.style.display = 'none';
                        if (samplesRow) {
                            samplesRow.style.display = 'none';
                        }
                    }
                }
            } else {
                row.style.display = 'none';
                if (samplesRow) {
                    samplesRow.style.display = 'none';
                }
            }
        } else if (row.classList.contains('spectrum-header-row')) {
            // Filter spectrum rows (only if container filter is not set or container is visible)
            const parentContainer = row.closest('.container-samples-row');
            if (parentContainer && parentContainer.style.display !== 'none') {
                const spectrumName = row.textContent.toLowerCase();
                const itemsRow = row.nextElementSibling;
                
                if (!spectrumFilter || spectrumName.includes(spectrumFilter)) {
                    row.style.display = '';
                    if (itemsRow && itemsRow.classList.contains('spectrum-items-row')) {
                        itemsRow.style.display = '';
                    }
                } else {
                    row.style.display = 'none';
                    if (itemsRow) {
                        itemsRow.style.display = 'none';
                    }
                }
            }
        }
    });
}

async function loadContainers() {
    try {
        const response = await fetch('/api/peak-area/containers');
        const result = await response.json();
        if (result.success) {
            const select = document.getElementById('peak-area-container-name');
            if (select) {
                // Keep first option, clear others
                select.innerHTML = '<option value="">-- Chọn container --</option>';
                result.data.forEach(containerName => {
                    const option = document.createElement('option');
                    option.value = containerName;
                    option.textContent = containerName;
                    select.appendChild(option);
                });
            }
        }
    } catch (error) {
        console.error('Error loading containers:', error);
    }
}

function toggleStandardSampleDropdown() {
    const checkbox = document.getElementById('peak-area-is-standard-sample');
    const dropdownGroup = document.getElementById('peak-area-standard-sample-group');
    const dropdown = document.getElementById('peak-area-standard-sample-name');
    
    if (checkbox.checked) {
        dropdownGroup.style.display = 'block';
        dropdown.required = true;
        // Load standard sample names if not already loaded
        if (dropdown.options.length <= 1) {
            loadStandardSampleNames();
        }
    } else {
        dropdownGroup.style.display = 'none';
        dropdown.required = false;
        dropdown.value = '';
    }
}

function toggleIrradiatedStandardSampleDropdown() {
    const checkbox = document.getElementById('irradiated-sample-is-standard-sample');
    const dropdownGroup = document.getElementById('irradiated-sample-standard-sample-group');
    const dropdown = document.getElementById('irradiated-sample-standard-sample-name');
    
    if (checkbox && checkbox.checked) {
        dropdownGroup.style.display = 'block';
        dropdown.required = true;
        // Load standard sample names if not already loaded
        if (dropdown.options.length <= 1) {
            loadIrradiatedStandardSampleNames();
        }
    } else if (checkbox) {
        dropdownGroup.style.display = 'none';
        dropdown.required = false;
        dropdown.value = '';
    }
}

async function loadIrradiatedStandardSampleNames() {
    const select = document.getElementById('irradiated-sample-standard-sample-name');
    if (!select) return;
    
    try {
        const response = await fetch('/api/standard-sample/sample-names');
        const result = await response.json();
        if (result.success) {
            select.innerHTML = '<option value="">-- Chọn tên mẫu chuẩn --</option>';
            result.data.forEach(sampleName => {
                const option = document.createElement('option');
                option.value = sampleName;
                option.textContent = sampleName;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error loading standard sample names:', error);
    }
}

async function loadStandardSampleNames() {
    const select = document.getElementById('peak-area-standard-sample-name');
    
    try {
        const response = await fetch('/api/standard-sample/sample-names');
        const result = await response.json();
        if (result.success) {
            select.innerHTML = '<option value="">-- Chọn tên mẫu chuẩn --</option>';
            result.data.forEach(sampleName => {
                const option = document.createElement('option');
                option.value = sampleName;
                option.textContent = sampleName;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error loading standard sample names:', error);
    }
}

async function loadSpectrumNames() {
    const containerName = document.getElementById('peak-area-container-name').value;
    const select = document.getElementById('peak-area-spectrum-name');
    
    if (!containerName) {
        select.innerHTML = '<option value="">-- Chọn tên phổ --</option>';
        // Clear saved spectrum when container is cleared
        localStorage.removeItem('peakArea_lastSpectrum');
        return;
    }
    
    try {
        const response = await fetch(`/api/peak-area/spectrum-names?container_name=${encodeURIComponent(containerName)}`);
        const result = await response.json();
        if (result.success) {
            select.innerHTML = '<option value="">-- Chọn tên phổ --</option>';
            result.data.forEach(spectrumName => {
                const option = document.createElement('option');
                option.value = spectrumName;
                option.textContent = spectrumName;
                select.appendChild(option);
            });
            
            // Check if saved spectrum is still valid for this container
            const lastSpectrum = localStorage.getItem('peakArea_lastSpectrum');
            if (lastSpectrum && result.data.includes(lastSpectrum)) {
                select.value = lastSpectrum;
            } else if (lastSpectrum) {
                // Clear invalid saved spectrum
                localStorage.removeItem('peakArea_lastSpectrum');
            }
        }
    } catch (error) {
        console.error('Error loading spectrum names:', error);
        showToast('Lỗi khi tải danh sách tên phổ: ' + error.message, 'error');
    }
}

async function loadElements() {
    try {
        // Wait a bit to ensure element exists in DOM
        await new Promise(resolve => setTimeout(resolve, 50));
        
        const select = document.getElementById('peak-area-element-name');
        if (!select) {
            console.error('Element select not found in DOM');
            // Try again after a longer delay
            setTimeout(async () => {
                await loadElements();
            }, 200);
            return;
        }
        
        const response = await fetch('/api/peak-area/elements');
        const result = await response.json();
        
        console.log('Elements API response:', result);
        
        if (result.success) {
            // Keep first option, clear others
            select.innerHTML = '<option value="">-- Chọn nguyên tố --</option>';
            if (result.data && result.data.length > 0) {
                result.data.forEach(element => {
                    const option = document.createElement('option');
                    option.value = element;
                    option.textContent = element;
                    select.appendChild(option);
                });
                console.log(`Loaded ${result.data.length} elements into dropdown`);
            } else {
                console.warn('No elements found in nuclear data');
                showToast('Chưa có dữ liệu nguyên tố. Vui lòng import dữ liệu hạt nhân trước.', 'error');
            }
        } else {
            console.error('Error loading elements:', result.error);
            showToast('Lỗi khi tải danh sách nguyên tố: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('Error loading elements:', error);
        showToast('Lỗi khi tải danh sách nguyên tố: ' + error.message, 'error');
    }
}

async function loadEnergies() {
    const element = document.getElementById('peak-area-element-name').value;
    const select = document.getElementById('peak-area-energy');
    
    if (!element) {
        select.innerHTML = '<option value="">-- Chọn năng lượng --</option>';
        return;
    }
    
    try {
        const response = await fetch(`/api/peak-area/energies?element=${encodeURIComponent(element)}`);
        const result = await response.json();
        if (result.success) {
            select.innerHTML = '<option value="">-- Chọn năng lượng --</option>';
            result.data.forEach(energy => {
                const option = document.createElement('option');
                option.value = energy;
                option.textContent = energy.toFixed(2);
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error loading energies:', error);
        showToast('Lỗi khi tải danh sách năng lượng: ' + error.message, 'error');
    }
}

// Helper functions to save/load last used values
function saveLastPeakAreaValues(containerName, spectrumName, elementName) {
    if (containerName) {
        localStorage.setItem('peakArea_lastContainer', containerName);
    }
    if (spectrumName) {
        localStorage.setItem('peakArea_lastSpectrum', spectrumName);
    }
    if (elementName) {
        localStorage.setItem('peakArea_lastElement', elementName);
    }
}

function getLastPeakAreaValues() {
    return {
        container: localStorage.getItem('peakArea_lastContainer') || '',
        spectrum: localStorage.getItem('peakArea_lastSpectrum') || '',
        element: localStorage.getItem('peakArea_lastElement') || ''
    };
}

function clearLastPeakAreaValues() {
    localStorage.removeItem('peakArea_lastContainer');
    localStorage.removeItem('peakArea_lastSpectrum');
    localStorage.removeItem('peakArea_lastElement');
}

async function showPeakAreaModal(id = null) {
    editingPeakAreaId = id;
    const modal = document.getElementById('peak-area-modal');
    const form = document.getElementById('peak-area-form');
    const title = document.getElementById('peak-area-modal-title');
    
    // Show modal first
    if (modal) {
        modal.classList.add('active');
    }
    
    // Wait a bit for modal to render
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Load dropdowns
    await loadContainers();
    await loadElements();
    
    if (id !== null) {
        title.textContent = 'Sửa Dữ liệu Diện tích đỉnh';
        const item = peakAreaData.find(d => d.id === id);
        if (item) {
            document.getElementById('peak-area-id').value = item.id;
            document.getElementById('peak-area-container-name').value = item.container_name || '';
            await loadSpectrumNames();
            document.getElementById('peak-area-spectrum-name').value = item.spectrum_name || '';
            document.getElementById('peak-area-element-name').value = item.element_name || '';
            await loadEnergies();
            document.getElementById('peak-area-energy').value = item.energy || '';
            document.getElementById('peak-area-peak-area').value = item.peak_area !== null && item.peak_area !== undefined ? item.peak_area : '';
            document.getElementById('peak-area-peak-area-error').value = item.peak_area_error !== null && item.peak_area_error !== undefined ? item.peak_area_error : '';
        }
    } else {
        title.textContent = 'Thêm Dữ liệu Diện tích đỉnh';
        
        // Get last used values
        const lastValues = getLastPeakAreaValues();
        
        // Reset form fields manually to preserve loaded options
        document.getElementById('peak-area-id').value = '';
        
        // Set last used container if available
        if (lastValues.container) {
            const containerSelect = document.getElementById('peak-area-container-name');
            // Check if the saved container still exists in the options
            const containerExists = Array.from(containerSelect.options).some(opt => opt.value === lastValues.container);
            if (containerExists) {
                containerSelect.value = lastValues.container;
                // Load spectrum names for this container
                await loadSpectrumNames();
                // Set last used spectrum if available and valid
                if (lastValues.spectrum) {
                    const spectrumSelect = document.getElementById('peak-area-spectrum-name');
                    const spectrumExists = Array.from(spectrumSelect.options).some(opt => opt.value === lastValues.spectrum);
                    if (spectrumExists) {
                        spectrumSelect.value = lastValues.spectrum;
                    }
                }
            } else {
                document.getElementById('peak-area-container-name').value = '';
                document.getElementById('peak-area-spectrum-name').innerHTML = '<option value="">-- Chọn tên phổ --</option>';
            }
        } else {
            document.getElementById('peak-area-container-name').value = '';
            document.getElementById('peak-area-spectrum-name').innerHTML = '<option value="">-- Chọn tên phổ --</option>';
        }
        
        // Set last used element if available
        if (lastValues.element) {
            const elementSelect = document.getElementById('peak-area-element-name');
            // Check if the saved element still exists in the options
            const elementExists = Array.from(elementSelect.options).some(opt => opt.value === lastValues.element);
            if (elementExists) {
                elementSelect.value = lastValues.element;
                // Load energies for this element
                await loadEnergies();
            } else {
                document.getElementById('peak-area-element-name').value = '';
                document.getElementById('peak-area-energy').innerHTML = '<option value="">-- Chọn năng lượng --</option>';
            }
        } else {
            document.getElementById('peak-area-element-name').value = '';
            document.getElementById('peak-area-energy').innerHTML = '<option value="">-- Chọn năng lượng --</option>';
        }
        
        document.getElementById('peak-area-peak-area').value = '';
        document.getElementById('peak-area-peak-area-error').value = '';
    }
}

function closePeakAreaModal() {
    document.getElementById('peak-area-modal').classList.remove('active');
    editingPeakAreaId = null;
}

async function editPeakAreaData(id) {
    showPeakAreaModal(id);
}

async function deletePeakAreaData(id) {
    if (!confirm('Bạn có chắc chắn muốn xóa dữ liệu này?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/peak-area/data/${id}`, {
            method: 'DELETE'
        });
        
        const result = await response.json();
        if (result.success) {
            showToast(result.message);
            loadPeakAreaData();
        } else {
            showToast('Lỗi: ' + result.error, 'error');
        }
    } catch (error) {
        showToast('Lỗi kết nối: ' + error.message, 'error');
    }
}

async function deletePeakAreaContainer(containerName) {
    if (!confirm(`Bạn có chắc chắn muốn xóa toàn bộ dữ liệu của container "${containerName}"?\n\nHành động này sẽ xóa tất cả các bản ghi trong container này và không thể hoàn tác.`)) {
        return;
    }
    
    try {
        const encodedContainerName = encodeURIComponent(containerName);
        const response = await fetch(`/api/peak-area/container/${encodedContainerName}`, {
            method: 'DELETE'
        });
        
        const result = await response.json();
        if (result.success) {
            showToast(result.message);
            loadPeakAreaData();
        } else {
            showToast('Lỗi: ' + result.error, 'error');
        }
    } catch (error) {
        showToast('Lỗi kết nối: ' + error.message, 'error');
    }
}

// ========== CSV Import Functions ==========

let csvImportData = [];
let csvImportDataOriginal = []; // Store original data before filtering
let csvRowIdCounter = 0;

async function showPeakAreaCSVImportModal() {
    const modal = document.getElementById('peak-area-csv-modal');
    if (modal) {
        modal.classList.add('active');
        // Reset form
        document.getElementById('csv-file-input').value = '';
        document.getElementById('csv-preview-section').style.display = 'none';
        csvImportData = [];
        csvImportDataOriginal = [];
        csvRowIdCounter = 0;
        updateCSVPreviewCount(0);
        // Load containers
        await loadCSVContainers();
    }
}

async function handleToleranceChange() {
    try {
        if (csvImportDataOriginal.length > 0 || csvImportData.length > 0) {
            // Sync slider and input
            const slider = document.getElementById('csv-energy-tolerance-slider');
            const input = document.getElementById('csv-energy-tolerance');
            if (slider && input) {
                slider.value = input.value;
            }
            
            await renderCSVPreview();
            const originalCount = csvImportDataOriginal.length > 0 ? csvImportDataOriginal.length : csvImportData.length;
            const filteredCount = csvImportData.length;
            const tolerance = document.getElementById('csv-energy-tolerance')?.value || '2';
            
            if (filteredCount === 0) {
                showToast(`Không có đỉnh nào khớp với độ lệch ±${tolerance} keV`, 'warning');
            } else {
                const removedCount = originalCount - filteredCount;
                showToast(`Lọc còn ${filteredCount} đỉnh${removedCount > 0 ? ` (đã loại bỏ ${removedCount} đỉnh không khớp)` : ''}`, 'success');
            }
        }
    } catch (error) {
        console.error('Error in handleToleranceChange:', error);
    }
}

function closePeakAreaCSVImportModal() {
    const modal = document.getElementById('peak-area-csv-modal');
    if (modal) {
        modal.classList.remove('active');
    }
    // Reset form
    document.getElementById('csv-file-input').value = '';
    document.getElementById('csv-preview-section').style.display = 'none';
    csvImportData = [];
    updateCSVPreviewCount(0);
}

async function loadCSVContainers() {
    try {
        const response = await fetch('/api/irradiated/containers');
        const result = await response.json();
        if (result.success) {
            const select = document.getElementById('csv-container-select');
            if (select) {
                select.innerHTML = '<option value="">-- Chọn container --</option>';
                result.data.forEach(container => {
                    const option = document.createElement('option');
                    option.value = container.container_name;
                    option.textContent = container.container_name;
                    select.appendChild(option);
                });
            }
        }
    } catch (error) {
        console.error('Error loading containers:', error);
        showToast('Lỗi khi tải danh sách container: ' + error.message, 'error');
    }
}

async function loadCSVSpectrumNames() {
    const containerName = document.getElementById('csv-container-select').value;
    if (!containerName) {
        return;
    }
    
    try {
        const response = await fetch(`/api/irradiated/containers/${encodeURIComponent(containerName)}/spectra`);
        const result = await response.json();
        if (result.success && result.data) {
            // Update spectrum names in preview table if needed
            // The spectrum name is already set from file name, so we just validate
        }
    } catch (error) {
        console.error('Error loading spectrum names:', error);
    }
}

function handleCSVFileSelect(event) {
    const files = event.target.files;
    if (!files || files.length === 0) {
        return;
    }
    
    // Validate all files are CSV
    const csvFiles = Array.from(files).filter(file => {
        if (!file.name.toLowerCase().endsWith('.csv')) {
            showToast(`File "${file.name}" không phải file CSV, bỏ qua`, 'warning');
            return false;
        }
        return true;
    });
    
    if (csvFiles.length === 0) {
        showToast('Không có file CSV hợp lệ', 'error');
        return;
    }
    
    // Reset import data
    csvImportData = [];
    csvImportDataOriginal = [];
    csvRowIdCounter = 0;
    
    // Process files sequentially
    let processedCount = 0;
    const totalFiles = csvFiles.length;
    
    csvFiles.forEach((file, fileIndex) => {
        const spectrumName = file.name.replace(/\.csv$/i, '').trim();
        const reader = new FileReader();
        
        reader.onload = async function(e) {
            try {
                const text = e.target.result;
                parseCSVFile(text, spectrumName);
                processedCount++;
                
                // When all files are processed, show preview
                if (processedCount === totalFiles) {
                    if (csvImportData.length === 0) {
                        showToast('Không tìm thấy dữ liệu hợp lệ trong các file CSV', 'error');
                        return;
                    }
                    
                    // Save original data before filtering
                    csvImportDataOriginal = JSON.parse(JSON.stringify(csvImportData));
                    
                    // Show preview section and filter data
                    document.getElementById('csv-preview-section').style.display = 'block';
                    const originalCount = csvImportData.length;
                    await renderCSVPreview();
                    const filteredCount = csvImportData.length;
                    
                    if (filteredCount === 0) {
                        showToast(`Đã đọc ${originalCount} đỉnh từ ${totalFiles} file CSV, nhưng không có đỉnh nào khớp với độ lệch đã chọn`, 'warning');
                    } else {
                        const removedCount = originalCount - filteredCount;
                        showToast(`Đã đọc ${originalCount} đỉnh từ ${totalFiles} file CSV, lọc còn ${filteredCount} đỉnh${removedCount > 0 ? ` (đã loại bỏ ${removedCount} đỉnh không khớp)` : ''}`, 'success');
                    }
                }
            } catch (error) {
                showToast(`Lỗi khi đọc file "${file.name}": ${error.message}`, 'error');
                console.error('CSV parsing error:', error);
                processedCount++;
                
                if (processedCount === totalFiles && csvImportData.length > 0) {
                    document.getElementById('csv-preview-section').style.display = 'block';
                    await renderCSVPreview();
                }
            }
        };
        
        reader.onerror = async function() {
            showToast(`Lỗi khi đọc file "${file.name}"`, 'error');
            processedCount++;
            
            if (processedCount === totalFiles && csvImportData.length > 0) {
                document.getElementById('csv-preview-section').style.display = 'block';
                await renderCSVPreview();
            }
        };
        
        reader.readAsText(file, 'UTF-8');
    });
}

function parseCSVFile(csvText, spectrumName) {
    try {
        // Parse CSV - handle both comma and semicolon separators
        const lines = csvText.split(/\r?\n/).filter(line => line.trim());
        if (lines.length === 0) {
            return; // Skip empty files
        }
        
        // Check if first line is a header (contains text keywords)
        const headerKeywords = ['năng lượng', 'energy', 'diện tích', 'peak', 'sai số', 'error', 'uncertainty'];
        let startIndex = 0;
        if (lines.length > 0) {
            const firstLine = lines[0].toLowerCase();
            const isHeader = headerKeywords.some(keyword => firstLine.includes(keyword));
            if (isHeader) {
                startIndex = 1; // Skip header
            }
        }
        
        // Parse each line (skip header if exists)
        for (let index = startIndex; index < lines.length; index++) {
            const line = lines[index];
            // Try comma first, then semicolon
            let columns = line.split(',');
            if (columns.length < 2) {
                columns = line.split(';');
            }
            
            // Remove quotes and trim
            columns = columns.map(col => col.replace(/^["']|["']$/g, '').trim());
            
            // Skip empty lines
            if (columns.length < 2 || (!columns[0] && !columns[1])) {
                continue;
            }
            
            const energy = parseFloat(columns[0]);
            const peakArea = parseFloat(columns[1]);
            const peakAreaError = columns.length >= 3 && columns[2] ? parseFloat(columns[2]) : null;
            
            // Validate data
            if (isNaN(energy) || isNaN(peakArea)) {
                console.warn(`Dòng ${index + 1}: Dữ liệu không hợp lệ, bỏ qua`);
                continue;
            }
            
            csvImportData.push({
                id: csvRowIdCounter++,
                spectrum_name: spectrumName,
                energy: energy,
                peak_area: peakArea,
                peak_area_error: peakAreaError,
                element_name: '', // Will be selected by user
                matching_elements: [], // Will be populated during filtering
                element_half_life_map: {},
            element_energy_map: {},
            energy_from_nuclear: null
            });
        }
    } catch (error) {
        console.error('CSV parsing error:', error);
        throw error;
    }
}

function applyElementSelection(row, element) {
    row.element_name = element;
    if (row.element_energy_map && Object.prototype.hasOwnProperty.call(row.element_energy_map, element)) {
        row.energy_from_nuclear = row.element_energy_map[element];
    } else {
        row.energy_from_nuclear = row.energy;
    }
}

function groupCSVRowsByEnergy(rows, threshold = 1) {
    if (!Array.isArray(rows) || rows.length === 0) {
        return [];
    }
    
    const sortedRows = [...rows].sort((a, b) => a.energy - b.energy);
    
    const groups = [];
    
    sortedRows.forEach(row => {
        let targetGroup = null;
        if (groups.length > 0) {
            const lastGroup = groups[groups.length - 1];
            const withinThreshold = Math.abs(lastGroup.reference_energy - row.energy) <= threshold;
            if (withinThreshold) {
                targetGroup = lastGroup;
            }
        }
        
        if (!targetGroup) {
            targetGroup = {
                id: `group-${row.id}`,
                spectrum_names: new Set(),
                reference_energy: row.energy,
                rows: [],
                minEnergy: row.energy,
                maxEnergy: row.energy,
                matching_elements: new Set()
            };
            groups.push(targetGroup);
        }
        
        targetGroup.rows.push(row);
        targetGroup.minEnergy = Math.min(targetGroup.minEnergy, row.energy);
        targetGroup.maxEnergy = Math.max(targetGroup.maxEnergy, row.energy);
        if (row.spectrum_name) {
            targetGroup.spectrum_names.add(row.spectrum_name);
        }
        if (Array.isArray(row.matching_elements)) {
            row.matching_elements.forEach(element => {
                targetGroup.matching_elements.add(element);
            });
        }
    });
    
    return groups.map(group => {
        let selectedElement = '';
        if (group.rows.length > 0) {
            const firstElement = group.rows[0].element_name || '';
            const allSame = firstElement && group.rows.every(r => r.element_name === firstElement);
            selectedElement = allSame ? firstElement : '';
        }
        const spectrumList = Array.from(group.spectrum_names);
        const spectrumSummary = spectrumList.length === 0 
            ? '-' 
            : spectrumList.length === 1 
                ? spectrumList[0]
                : `${spectrumList.slice(0, 3).join(', ')}${spectrumList.length > 3 ? '…' : ''}`;
        return {
            ...group,
            matching_elements: Array.from(group.matching_elements).filter(Boolean),
            selectedElement,
            spectrumSummary,
            spectrumCount: spectrumList.length
        };
    });
}

function formatEnergySummary(group) {
    if (!group || !group.rows || group.rows.length === 0) return '-';
    if (group.rows.length === 1) {
        return `${group.rows[0].energy.toFixed(2)}`;
    }
    const min = group.minEnergy.toFixed(2);
    const max = group.maxEnergy.toFixed(2);
    return `${min} - ${max}`;
}

function buildSpectrumDetails(group) {
    if (!group || !group.rows || group.rows.length === 0) return '';
    const spectrumMap = new Map();
    group.rows.forEach(row => {
        const name = row.spectrum_name || 'Không rõ phổ';
        if (!spectrumMap.has(name)) {
            spectrumMap.set(name, 1);
        } else {
            spectrumMap.set(name, spectrumMap.get(name) + 1);
        }
    });
    const details = Array.from(spectrumMap.entries()).map(([name, count]) => {
        return `${name}${count > 1 ? ` (${count})` : ''}`;
    });
    return details.join(', ');
}

function updateCSVPreviewCount(count) {
    const badge = document.getElementById('csv-preview-count');
    if (!badge) return;
    const displayCount = typeof count === 'number' && count > 0 ? count : 0;
    badge.textContent = `${displayCount} nhóm năng lượng`;
}

async function renderCSVPreview() {
    try {
        const tbody = document.getElementById('csv-preview-tbody');
        if (!tbody) return;
        const tableContainer = document.querySelector('.csv-table-large');
        const previousScrollTop = tableContainer ? tableContainer.scrollTop : 0;
        
        tbody.innerHTML = '';
        
        // Use original data if available (for re-filtering when tolerance changes), otherwise use current data
        const dataToFilter = csvImportDataOriginal.length > 0 ? csvImportDataOriginal : csvImportData;
        
        if (!dataToFilter || dataToFilter.length === 0) {
            const emptyRow = document.createElement('tr');
            emptyRow.innerHTML = '<td colspan="5" style="text-align: center; padding: 20px; color: var(--text-secondary); font-style: italic;">Không có dữ liệu để hiển thị</td>';
            tbody.appendChild(emptyRow);
            csvImportData = [];
            updateCSVPreviewCount(0);
            return;
        }
        
        // Get energy tolerance from input
        const toleranceInput = document.getElementById('csv-energy-tolerance');
        const ENERGY_TOLERANCE = toleranceInput ? parseFloat(toleranceInput.value) || 2.0 : 2.0;
        
        // Load elements for validation (not for display)
        let elements = [];
        try {
            const response = await fetch('/api/peak-area/elements');
            const result = await response.json();
            if (result.success && result.data) {
                elements = result.data;
            }
        } catch (error) {
            console.error('Error loading elements:', error);
        }
        
        // Load nuclear data to filter peaks based on ±tolerance keV deviation
        let nuclearData = [];
        try {
            const response = await fetch('/api/nuclear/data');
            const result = await response.json();
            if (result.success && result.data) {
                nuclearData = result.data;
            }
        } catch (error) {
            console.error('Error loading nuclear data:', error);
        }
        
        // Filter peaks: only keep peaks with ±tolerance keV deviation from nuclear data
        const filteredData = [];
        let decayFilteredCount = 0;
        
        // Store selected elements before filtering (to preserve user selections)
        const selectedElements = new Map();
        csvImportData.forEach(row => {
            if (row.element_name) {
                selectedElements.set(`${row.spectrum_name}_${row.energy}`, row.element_name);
            }
        });
        
        dataToFilter.forEach((row) => {
            if (typeof row.id !== 'number') {
                row.id = csvRowIdCounter++;
            }
            
            // Find all matching nuclear data entries within ±ENERGY_TOLERANCE keV
            const matchingNucData = nuclearData.filter(nuc => {
                const nucEnergy = parseFloat(nuc.E);
                if (isNaN(nucEnergy)) return false;
                return Math.abs(nucEnergy - row.energy) <= ENERGY_TOLERANCE;
            });

            // Only include this peak if it has at least one match (peaks without matches are removed)
            if (matchingNucData.length > 0) {
                // Collect all unique elements that match and map to the closest nuclear energy
                const matchingElements = new Set();
                const elementBestMatches = new Map();
                const elementHalfLifeValues = new Map();
                const decaySeconds = getSpectrumDecayDurationSeconds(row.spectrum_name);
                matchingNucData.forEach(nuc => {
                    if (!nuc.element) {
                        return;
                    }
                    const nucEnergy = parseFloat(nuc.E);
                    if (isNaN(nucEnergy)) {
                        return;
                    }
                    
                    const halfLifeValue = typeof nuc.T_half === 'number'
                        ? nuc.T_half
                        : parseFloat(nuc.T_half);
                    const hasHalfLife = halfLifeValue !== null && halfLifeValue !== undefined && !isNaN(halfLifeValue) && halfLifeValue > 0;
                    if (decaySeconds !== null && hasHalfLife) {
                        const threshold = halfLifeValue * 10;
                        if (threshold < decaySeconds) {
                            return;
                        }
                    }
                    
                    matchingElements.add(nuc.element);
                    if (hasHalfLife && !elementHalfLifeValues.has(nuc.element)) {
                        elementHalfLifeValues.set(nuc.element, halfLifeValue);
                    }
                    const diff = Math.abs(nucEnergy - row.energy);
                    const currentBest = elementBestMatches.get(nuc.element);
                    if (!currentBest || diff < currentBest.diff) {
                        elementBestMatches.set(nuc.element, { energy: nucEnergy, diff });
                    }
                });
                
                row.matching_elements = Array.from(matchingElements);
                row.element_energy_map = {};
                row.element_half_life_map = {};
                elementBestMatches.forEach((value, element) => {
                    row.element_energy_map[element] = value.energy;
                    if (elementHalfLifeValues.has(element)) {
                        row.element_half_life_map[element] = elementHalfLifeValues.get(element);
                    }
                });
                
                if (row.matching_elements.length === 0) {
                    if (decaySeconds !== null && matchingNucData.length > 0) {
                        decayFilteredCount++;
                    }
                    return;
                }
                
                if (row.element_name && !row.matching_elements.includes(row.element_name)) {
                    row.element_name = '';
                    row.energy_from_nuclear = null;
                }
                
                // Restore selected element if it was previously selected
                const key = `${row.spectrum_name}_${row.energy}`;
                if (selectedElements.has(key)) {
                    const selectedElement = selectedElements.get(key);
                    // Only restore if the selected element is still in matching elements or is valid
                    if (matchingElements.has(selectedElement) || elements.includes(selectedElement)) {
                        applyElementSelection(row, selectedElement);
                    }
                }
                
                row.__matching_nuc_count = matchingNucData.length;
                row.__decay_seconds = decaySeconds;
                filteredData.push(row);
            }
        });
        
        if (filteredData.length === 0) {
            const emptyRow = document.createElement('tr');
            emptyRow.innerHTML = '<td colspan="5" style="text-align: center; padding: 20px; color: var(--text-secondary); font-style: italic;">Không có dữ liệu phù hợp với độ lệch đã chọn</td>';
            tbody.appendChild(emptyRow);
            csvImportData = [];
            updateCSVPreviewCount(0);
            return;
        }
        
        // Render filtered data
        const groupedData = groupCSVRowsByEnergy(filteredData, 1);
        
        if (decayFilteredCount > 0) {
            showToast(`Đã bỏ ${decayFilteredCount} nhóm năng lượng do vượt quá 10 chu kỳ bán rã`, 'warning');
        }
        updateCSVPreviewCount(groupedData.length);
        
        groupedData.forEach((group, index) => {
            const tr = document.createElement('tr');
            
            // STT
            const tdSTT = document.createElement('td');
            tdSTT.textContent = index + 1;
            tr.appendChild(tdSTT);
            
            // Tổng hợp phổ
            const tdSpectrum = document.createElement('td');
            const spectrumDetails = buildSpectrumDetails(group);
            tdSpectrum.innerHTML = `
                <div style="font-weight: 600;">${group.spectrumSummary || '-'}</div>
                <small style="color: var(--text-secondary); display: block; margin-top: 4px;">
                    ${group.rows.length > 1 ? `Lấy ${group.rows.length} đỉnh` : '1 đỉnh'}
                    ${spectrumDetails ? ` • ${spectrumDetails}` : ''}
                </small>
            `;
            tr.appendChild(tdSpectrum);
            
            // Năng lượng
            const tdEnergy = document.createElement('td');
            const energySummary = formatEnergySummary(group);
            const energyDetails = group.rows.length > 1 
                ? `<small style="display:block; color: var(--text-secondary); margin-top: 4px;">${group.rows.map(r => r.energy.toFixed(2)).join(', ')}</small>`
                : '';
            tdEnergy.innerHTML = `<div>${energySummary}</div>${energyDetails}`;
            tr.appendChild(tdEnergy);
            
            // Nguyên tố - Show matching elements as buttons, others in dropdown
            const tdElement = document.createElement('td');
            tdElement.style.padding = '12px';
            
            const elementContainer = document.createElement('div');
            elementContainer.style.display = 'flex';
            elementContainer.style.flexDirection = 'column';
            elementContainer.style.gap = '8px';
            
            const decayFiltered = group.rows.some(r => {
                const rowMatches = Array.isArray(r.matching_elements) ? r.matching_elements.length : 0;
                return r.__matching_nuc_count > 0 && rowMatches === 0 && r.__decay_seconds !== null;
            });
            
            let currentSelection = group.selectedElement || '';
            if (!currentSelection) {
                const preferredElement = getPreferredElementForEnergy(group.reference_energy);
                if (preferredElement && group.matching_elements.includes(preferredElement)) {
                    currentSelection = preferredElement;
                    group.rows.forEach(row => applyElementSelection(row, preferredElement));
                }
            }
            if (!currentSelection && group.matching_elements.length === 1) {
                currentSelection = group.matching_elements[0];
                group.rows.forEach(row => applyElementSelection(row, currentSelection));
            }
            
            // Show matching elements as buttons
            if (group.matching_elements && group.matching_elements.length > 0) {
                const matchingContainer = document.createElement('div');
                matchingContainer.style.display = 'flex';
                matchingContainer.style.flexWrap = 'wrap';
                matchingContainer.style.gap = '6px';
                matchingContainer.style.marginBottom = '4px';
                
                group.matching_elements.forEach(element => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'btn';
                btn.textContent = element;
                btn.style.cssText = 'padding: 6px 12px; font-size: 0.85rem; border-radius: 4px; cursor: pointer; transition: all 0.2s;';
                
                // Check if this element is selected
                const isSelected = currentSelection === element;
                if (isSelected) {
                    btn.classList.add('btn-primary');
                    btn.style.backgroundColor = 'var(--primary-color)';
                    btn.style.color = 'white';
                    btn.style.border = '1px solid var(--primary-color)';
                } else {
                    btn.classList.add('btn-secondary');
                    btn.style.backgroundColor = '#fff3cd';
                    btn.style.color = '#856404';
                    btn.style.border = '1px solid #ffc107';
                    btn.style.fontWeight = '500';
                }
                
                btn.onclick = function() {
                    // Update all buttons in this row
                    matchingContainer.querySelectorAll('button').forEach(b => {
                        b.classList.remove('btn-primary');
                        b.classList.add('btn-secondary');
                        b.style.backgroundColor = '#fff3cd';
                        b.style.color = '#856404';
                        b.style.border = '1px solid #ffc107';
                    });
                    
                    // Update clicked button
                    btn.classList.remove('btn-secondary');
                    btn.classList.add('btn-primary');
                    btn.style.backgroundColor = 'var(--primary-color)';
                    btn.style.color = 'white';
                    btn.style.border = '1px solid var(--primary-color)';
                    
                    // Update data
                    group.rows.forEach(row => {
                        applyElementSelection(row, element);
                        rememberEnergyPreference(row.energy, element);
                    });
                    rememberEnergyPreference(group.reference_energy, element);
                    currentSelection = element;
                };
                
                    matchingContainer.appendChild(btn);
                });
                
                elementContainer.appendChild(matchingContainer);
                
                // Auto-select if only one match
                if (currentSelection) {
                    const firstBtn = Array.from(matchingContainer.querySelectorAll('button')).find(btn => btn.textContent === currentSelection);
                    if (firstBtn) {
                        matchingContainer.querySelectorAll('button').forEach(b => {
                            if (b === firstBtn) {
                                b.classList.remove('btn-secondary');
                                b.classList.add('btn-primary');
                                b.style.backgroundColor = 'var(--primary-color)';
                                b.style.color = 'white';
                                b.style.border = '1px solid var(--primary-color)';
                            } else {
                                b.classList.remove('btn-primary');
                                b.classList.add('btn-secondary');
                                b.style.backgroundColor = '#fff3cd';
                                b.style.color = '#856404';
                                b.style.border = '1px solid #ffc107';
                            }
                        });
                    }
                }
            } else {
                // No matching elements - show message
                const noMatchMsg = document.createElement('div');
                noMatchMsg.textContent = decayFiltered
                    ? 'Không có nguyên tố gợi ý (đã quá 10 chu kỳ bán rã)'
                    : 'Không có nguyên tố gợi ý';
                noMatchMsg.style.color = 'var(--text-secondary)';
                noMatchMsg.style.fontStyle = 'italic';
                noMatchMsg.style.fontSize = '0.85rem';
                noMatchMsg.style.padding = '8px';
                elementContainer.appendChild(noMatchMsg);
            }
            
            tdElement.appendChild(elementContainer);
            tr.appendChild(tdElement);
            
            // Actions (Delete)
            const tdActions = document.createElement('td');
            tdActions.style.textAlign = 'center';
            tdActions.style.verticalAlign = 'middle';
            
            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.className = 'btn btn-danger';
            deleteBtn.style.cssText = 'padding: 6px 12px; font-size: 0.85rem; width: 100%;';
            deleteBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
            deleteBtn.title = 'Loại bỏ năng lượng này khỏi danh sách';
            deleteBtn.onclick = function() {
                const rowIds = group.rows.map(r => r.id);
                removeCSVRowsByIds(rowIds);
            };
            
            tdActions.appendChild(deleteBtn);
            tr.appendChild(tdActions);
            
            tbody.appendChild(tr);
        });
        
        // Update csvImportData to only include filtered data
        csvImportData = filteredData;
        
        if (tableContainer) {
            tableContainer.scrollTop = previousScrollTop;
        }
    } catch (error) {
        console.error('Error in renderCSVPreview:', error);
        if (typeof showToast === 'function') {
            showToast('Lỗi khi hiển thị dữ liệu: ' + error.message, 'error');
        }
    }
}

async function removeCSVRowsByIds(rowIds) {
    if (!Array.isArray(rowIds) || rowIds.length === 0) {
        return;
    }
    
    const idSet = new Set(rowIds);
    const beforeCount = csvImportData.length;
    csvImportData = csvImportData.filter(row => !idSet.has(row.id));
    
    if (csvImportDataOriginal.length > 0) {
        csvImportDataOriginal = csvImportDataOriginal.filter(row => !idSet.has(row.id));
    }
    
    if (beforeCount === csvImportData.length) {
        showToast('Không tìm thấy dòng cần xóa', 'error');
        return;
    }
    
    await renderCSVPreview();
    
    if (csvImportData.length === 0) {
        showToast('Đã loại bỏ tất cả năng lượng khỏi danh sách', 'warning');
    } else {
        showToast('Đã loại bỏ năng lượng khỏi danh sách', 'success');
    }
}

async function saveCSVData() {
    const containerName = document.getElementById('csv-container-select').value;
    if (!containerName) {
        showToast('Vui lòng chọn container', 'error');
        return;
    }
    
    if (!csvImportData || csvImportData.length === 0) {
        showToast('Không có dữ liệu để lưu', 'warning');
        return;
    }
    
    // Validate all rows have element selected
    const invalidRows = csvImportData.filter(row => !row.element_name || row.element_name.trim() === '');
    if (invalidRows.length > 0) {
        showToast(`Vui lòng chọn nguyên tố cho tất cả các dòng (còn ${invalidRows.length} dòng chưa chọn)`, 'error');
        return;
    }
    
    // Save all rows
    let successCount = 0;
    let errorCount = 0;
    
    for (const row of csvImportData) {
        try {
            const energyToSave = (row.energy_from_nuclear !== null && row.energy_from_nuclear !== undefined)
                ? row.energy_from_nuclear
                : row.energy;
            const response = await fetch('/api/peak-area/data', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    container_name: containerName,
                    spectrum_name: row.spectrum_name,
                    element_name: row.element_name,
                    energy: energyToSave,
                    peak_area: row.peak_area,
                    peak_area_error: row.peak_area_error
                })
            });
            
            const result = await response.json();
            if (result.success) {
                successCount++;
            } else {
                errorCount++;
                console.error('Error saving row:', result.error);
            }
        } catch (error) {
            errorCount++;
            console.error('Error saving row:', error);
        }
    }
    
    if (successCount > 0) {
        showToast(`Đã lưu thành công ${successCount} dòng dữ liệu${errorCount > 0 ? `, ${errorCount} dòng lỗi` : ''}`, 'success');
        loadPeakAreaData();
        closePeakAreaCSVImportModal();
    } else {
        showToast(`Lỗi: Không thể lưu dữ liệu. ${errorCount} dòng lỗi`, 'error');
    }
}

// ========== Calculation Result Functions ==========

let calculationContainers = [];

async function loadCalculationContainers() {
    try {
        const response = await fetch('/api/irradiated/containers');
        const result = await response.json();
        if (result.success) {
            calculationContainers = result.data;
            const select = document.getElementById('calc-container-select');
            if (select) {
                select.innerHTML = '<option value="">-- Chọn container --</option>';
                result.data.forEach(container => {
                    const option = document.createElement('option');
                    option.value = container.container_name;
                    option.textContent = container.container_name;
                    select.appendChild(option);
                });
            }
        }
    } catch (error) {
        console.error('Error loading calculation containers:', error);
    }
}

function onCalcContainerChanged() {
    const select = document.getElementById('calc-container-select');
    const saveBtn = document.getElementById('calc-save-result-btn');
    const containerName = select ? select.value : '';

    if (saveBtn) {
        // Hiển thị nút khi đã chọn container, ẩn khi chưa chọn
        saveBtn.style.display = containerName ? 'inline-flex' : 'none';
    }

    loadCalculationParameters();
}

async function loadCalculationParameters() {
    const containerName = document.getElementById('calc-container-select').value;
    const paramsSection = document.getElementById('calc-parameters-section');
    const monitorSpectraSection = document.getElementById('calc-monitor-spectra-section');
    
    if (!containerName) {
        paramsSection.style.display = 'none';
        monitorSpectraSection.style.display = 'none';
        return;
    }
    
    // Find container data
    const container = calculationContainers.find(c => c.container_name === containerName);
    if (!container) {
        showToast('Không tìm thấy thông tin container', 'error');
        paramsSection.style.display = 'none';
        monitorSpectraSection.style.display = 'none';
        return;
    }
    
    // Display irradiation position (Kênh chiếu)
    const irradiationPosition = container.irradiation_position || '-';
    document.getElementById('calc-irradiation-position').textContent = irradiationPosition;
    
    // Load reactor parameters based on irradiation position
    if (irradiationPosition && irradiationPosition !== '-') {
        try {
            const response = await fetch(`/api/reactor/parameters?position=${encodeURIComponent(irradiationPosition)}`);
            const result = await response.json();
            if (result.success && result.data && result.data.length > 0) {
                // Use the first matching reactor parameter
                const reactorParam = result.data[0];
                document.getElementById('calc-f-value').textContent = reactorParam.f_factor !== null && reactorParam.f_factor !== undefined 
                    ? reactorParam.f_factor.toFixed(4) : '-';
                document.getElementById('calc-alpha-value').textContent = reactorParam.alpha_factor !== null && reactorParam.alpha_factor !== undefined 
                    ? reactorParam.alpha_factor.toFixed(4) : '-';
                
                // Recalculate Qo(a) for monitor spectra when alpha is loaded
                setTimeout(() => {
                    recalculateMonitorSpectraQoA();
                }, 50);
            } else {
                document.getElementById('calc-f-value').textContent = '-';
                document.getElementById('calc-alpha-value').textContent = '-';
                showToast('Không tìm thấy thông số lò phản ứng cho vị trí chiếu này', 'warning');
            }
        } catch (error) {
            console.error('Error loading reactor parameters:', error);
            document.getElementById('calc-f-value').textContent = '-';
            document.getElementById('calc-alpha-value').textContent = '-';
            showToast('Lỗi khi tải thông số lò phản ứng: ' + error.message, 'error');
        }
    } else {
        document.getElementById('calc-f-value').textContent = '-';
        document.getElementById('calc-alpha-value').textContent = '-';
    }
    
    // Show parameters section
    paramsSection.style.display = 'block';
    
    // Load monitor spectra
    await loadMonitorSpectra(containerName);
}

// ========== Saved Calculation Result Functions ==========

async function loadSavedCalculationResults() {
    try {
        const response = await fetch('/api/calculation/results');
        const result = await response.json();
        if (result.success) {
            savedCalculationResults = result.data || [];
            renderSavedCalculationResultsTable();
        }
    } catch (error) {
        console.error('Error loading saved calculation results:', error);
    }
}

function renderSavedCalculationResultsTable() {
    const tbody = document.getElementById('saved-calculation-tbody');
    const countEl = document.getElementById('saved-calculation-count');

    if (!tbody) {
        return;
    }

    tbody.innerHTML = '';

    if (Array.isArray(savedCalculationResults) && savedCalculationResults.length > 0) {
        savedCalculationResults.forEach(result => {
            const row = document.createElement('tr');
            const formattedTime = window.formatDateTime
                ? window.formatDateTime(result.saved_at)
                : (result.saved_at || '-');

            const containerName = result.container_name || '-';

            row.innerHTML = `
                <td>${result.id}</td>
                <td>
                    <button type="button"
                            class="link-button"
                            onclick="showSavedCalculationDetails(${result.id})"
                            title="Xem kết quả tính toán đã lưu cho container này">
                        <strong>${containerName}</strong>
                    </button>
                </td>
                <td>${formattedTime}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn btn-secondary" onclick="downloadSavedCalculationResult(${result.id})">
                            <i class="fas fa-file-download"></i> Tải Excel
                        </button>
                        <button class="btn btn-danger" onclick="deleteSavedCalculationResult(${result.id})">
                            <i class="fas fa-trash"></i> Xóa
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(row);
        });
    } else {
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="4" style="text-align: center; padding: 40px; color: var(--text-secondary);">Chưa có kết quả tính toán nào được lưu.</td>';
        tbody.appendChild(row);
    }

    if (countEl) {
        countEl.textContent = Array.isArray(savedCalculationResults) ? savedCalculationResults.length : 0;
    }
}

async function saveCalculationResult() {
    const select = document.getElementById('calc-container-select');
    const containerName = select ? select.value : '';
    const saveBtn = document.getElementById('calc-save-result-btn');

    if (!containerName) {
        showToast('Vui lòng chọn container trước khi lưu kết quả.', 'error');
        return;
    }

    try {
        if (saveBtn) {
            saveBtn.disabled = true;
        }

        const payload = {
            container_name: containerName,
            details: Array.isArray(currentCalculationResultsForSaving) ? currentCalculationResultsForSaving : []
        };

        const response = await fetch('/api/calculation/results', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        if (result.success) {
            showToast(result.message || 'Đã lưu kết quả tính toán.');
            await loadSavedCalculationResults();
        } else {
            showToast('Lỗi khi lưu kết quả: ' + (result.error || ''), 'error');
        }
    } catch (error) {
        showToast('Lỗi kết nối khi lưu kết quả: ' + error.message, 'error');
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
        }
    }
}

async function deleteSavedCalculationResult(id) {
    if (!confirm('Bạn có chắc chắn muốn xóa kết quả tính toán này?')) {
        return;
    }

    try {
        const response = await fetch(`/api/calculation/results/${id}`, {
            method: 'DELETE'
        });
        const result = await response.json();
        if (result.success) {
            showToast(result.message || 'Đã xóa kết quả tính toán.');
            await loadSavedCalculationResults();
        } else {
            showToast('Lỗi khi xóa kết quả: ' + (result.error || ''), 'error');
        }
    } catch (error) {
        showToast('Lỗi kết nối khi xóa kết quả: ' + error.message, 'error');
    }
}

function showSavedCalculationDetails(resultId) {
    const detailsWrapper = document.getElementById('saved-calculation-details');
    const nameEl = document.getElementById('saved-calculation-details-container-name');
    const tbody = document.getElementById('saved-calculation-details-tbody');

    if (!detailsWrapper || !nameEl || !tbody) return;

    const record = savedCalculationResults.find(r => r.id === resultId);
    if (!record) {
        showToast('Không tìm thấy kết quả đã lưu.', 'error');
        detailsWrapper.style.display = 'none';
        return;
    }

    const containerName = record.container_name || '-';
    const details = Array.isArray(record.details) ? record.details : [];

    nameEl.textContent = containerName;
    tbody.innerHTML = '';

    if (!details.length) {
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="7" style="text-align: center; padding: 20px; color: var(--text-secondary);">Không có dữ liệu chi tiết được lưu cho container này.</td>';
        tbody.appendChild(row);
    } else {
        details.forEach(item => {
            const row = document.createElement('tr');
            const k0 = (typeof item.k0_concentration === 'number' && !isNaN(item.k0_concentration))
                ? item.k0_concentration.toFixed(2)
                : '-';
            const rel = (typeof item.relative_concentration === 'number' && !isNaN(item.relative_concentration))
                ? item.relative_concentration.toFixed(2)
                : '-';
            const energy = (typeof item.energy === 'number' && !isNaN(item.energy))
                ? item.energy.toFixed(2)
                : '-';
            const relativeStandardName = (item.relative_standard_name || '').trim();
            const relativeStandardSpectrum = (item.relative_standard_spectrum_name || '').trim();
            const relativeStandardDisplay = relativeStandardName
                ? (relativeStandardSpectrum ? `${relativeStandardName} (${relativeStandardSpectrum})` : relativeStandardName)
                : '';

            row.innerHTML = `
                <td>${item.sample_name || ''}</td>
                <td>${item.spectrum_name || ''}</td>
                <td>${item.element_name || ''}</td>
                <td style="text-align: right;">${energy}</td>
                <td style="text-align: right;">${k0}</td>
                <td style="text-align: right;">${rel}</td>
                <td>${relativeStandardDisplay}</td>
            `;
            tbody.appendChild(row);
        });
    }

    detailsWrapper.style.display = 'block';
}

function downloadSavedCalculationResult(resultId) {
    if (typeof resultId !== 'number') return;
    // Gọi trực tiếp endpoint tải file; trình duyệt sẽ tải file CSV (mở được bằng Excel)
    window.location.href = `/api/calculation/results/${resultId}/download`;
}

// Function to calculate Qo(a) for a single spectrum
function calculateQoAForSpectrum(qo, erA, ecdA, alpha) {
    try {
        // Default values
        const defaultQo = 15.7;
        const defaultErA = 5.65;
        const defaultEcdA = 0.55;
        
        // Use provided values or defaults
        const qoValue = (qo !== null && qo !== undefined && !isNaN(qo)) ? parseFloat(qo) : defaultQo;
        const erAValue = (erA !== null && erA !== undefined && !isNaN(erA)) ? parseFloat(erA) : defaultErA;
        const ecdAValue = (ecdA !== null && ecdA !== undefined && !isNaN(ecdA)) ? parseFloat(ecdA) : defaultEcdA;
        const alphaValue = (alpha !== null && alpha !== undefined && !isNaN(alpha)) ? parseFloat(alpha) : null;
        
        // Check if alpha is available
        if (alphaValue === null || isNaN(alphaValue)) {
            return null;
        }
        
        // Calculate Qo(a) = ((Qo-0.429)/Er(a)^alpha) + (0.429/(Ecd(a)^alpha*(2*alpha+1)))
        // Debug: log input values
        console.log('Qo(a) Calculation - Input values:', {
            Qo: qoValue,
            'Er(a)': erAValue,
            'Ecd(a)': ecdAValue,
            alpha: alphaValue
        });
        
        // Term 1: (Qo - 0.429) / Er(a)^alpha
        const term1 = (qoValue - 0.429) / Math.pow(erAValue, alphaValue);
        
        // Term 2: 0.429 / (Ecd(a)^alpha * (2*alpha + 1))
        // Note: Based on Excel formula interpretation, this should be:
        // 0.429 / (Ecd(a)^alpha * (2*alpha + 1))
        // NOT: 0.429 / (Ecd(a)^(alpha * (2*alpha + 1)))
        const ecdA_power_alpha = Math.pow(ecdAValue, alphaValue);
        const denominator_term2 = ecdA_power_alpha * (2 * alphaValue + 1);
        const term2 = 0.429 / denominator_term2;
        
        const qoA = term1 + term2;
        
        // Debug: log calculation steps
        console.log('Qo(a) Calculation - Steps:', {
            'Qo - 0.429': qoValue - 0.429,
            'Er(a)^alpha': Math.pow(erAValue, alphaValue),
            'term1': term1,
            'Ecd(a)^alpha': ecdA_power_alpha,
            '2*alpha + 1': 2 * alphaValue + 1,
            'Ecd(a)^alpha * (2*alpha+1)': denominator_term2,
            'term2': term2,
            'Qo(a) = term1 + term2': qoA
        });
        
        // Also calculate alternative interpretation for comparison
        const alternative_term2 = 0.429 / Math.pow(ecdAValue, alphaValue * (2 * alphaValue + 1));
        const alternative_qoA = term1 + alternative_term2;
        console.log('Qo(a) Alternative calculation (if exponent is alpha*(2*alpha+1)):', {
            'Ecd(a)^(alpha*(2*alpha+1))': Math.pow(ecdAValue, alphaValue * (2 * alphaValue + 1)),
            'alternative_term2': alternative_term2,
            'alternative_Qo(a)': alternative_qoA
        });
        
        return qoA;
    } catch (error) {
        console.error('Error calculating Qo(a):', error);
        return null;
    }
}

// Function to recalculate Qo(a) for all monitor spectra
function recalculateMonitorSpectraQoA() {
    const tbody = document.getElementById('calc-monitor-spectra-tbody');
    if (!tbody) return;
    
    const rows = tbody.querySelectorAll('tr[data-spectrum-name]');
    const ecdA = parseFloat(document.getElementById('calc-ecd-a')?.value) || 0.55;
    const alphaText = document.getElementById('calc-alpha-value')?.textContent.trim() || '-';
    const alpha = (alphaText !== '-' && alphaText !== '') ? parseFloat(alphaText) : null;
    const defaultQo = 15.7;
    const defaultErA = 5.65;
    
    // Recalculate Qo(a) for monitor (Au) and update monitorSpectraData
    const qoA = calculateQoAForSpectrum(defaultQo, defaultErA, ecdA, alpha);
    
    // Update monitorSpectraData if we have the first monitor spectrum's epsilon_p_a
    if (qoA !== null && rows.length > 0) {
        // Try to get epsilon_p_a from the first row's data attribute or from the original data
        // We need to reload monitor spectra to get fresh epsilon_p_a, but for now, keep existing if available
        if (monitorSpectraData && monitorSpectraData.epsilonPA !== null && monitorSpectraData.epsilonPA !== undefined) {
            monitorSpectraData.qoA = qoA;
        }
    }
    
    rows.forEach(row => {
        const qoAEl = row.querySelector('.qo-a-value');
        if (!qoAEl) return;
        
        // Get values from data attributes
        const qo = parseFloat(row.dataset.qo) || 15.7;
        const erA = parseFloat(row.dataset.erA) || 5.65;
        
        const qoAForRow = calculateQoAForSpectrum(qo, erA, ecdA, alpha);
        if (qoAForRow !== null) {
            qoAEl.textContent = qoAForRow.toFixed(6);
        } else {
            qoAEl.textContent = '-';
        }
    });
    
    // Reload non-monitor spectra to update concentration calculations
    const containerName = document.getElementById('calc-container-select')?.value;
    if (containerName) {
        loadNonMonitorSpectra(containerName);
    }
}

async function loadMonitorSpectra(containerName) {
    const monitorSpectraSection = document.getElementById('calc-monitor-spectra-section');
    const tbody = document.getElementById('calc-monitor-spectra-tbody');
    
    if (!containerName) {
        monitorSpectraSection.style.display = 'none';
        return;
    }
    
    try {
        const response = await fetch(`/api/calculation/monitor-spectra?container_name=${encodeURIComponent(containerName)}`);
        const result = await response.json();
        
        if (result.success) {
            const spectra = result.data;
            tbody.innerHTML = '';
            
            // Debug: log dữ liệu nhận được
            console.log('Monitor spectra data:', spectra);
            
            // Store monitor spectra data for concentration calculation
            // We'll use the first monitor spectrum's Qo(a) and epsilon_p_a as reference
            monitorSpectraData = null;
            if (spectra.length > 0) {
                const alphaText = document.getElementById('calc-alpha-value')?.textContent.trim() || '-';
                const alpha = (alphaText !== '-' && alphaText !== '') ? parseFloat(alphaText) : null;
                const ecdA = parseFloat(document.getElementById('calc-ecd-a')?.value) || 0.55;
                const defaultQo = 15.7;
                const defaultErA = 5.65;
                
                // Calculate Qo(a) for monitor (Au)
                const qoA = calculateQoAForSpectrum(defaultQo, defaultErA, ecdA, alpha);
                
                // Get epsilon_p_a from first monitor spectrum
                const firstSpectrum = spectra[0];
                const epsilonPA = firstSpectrum.epsilon_p_a;
                
                if (qoA !== null && epsilonPA !== null && epsilonPA !== undefined && !isNaN(epsilonPA)) {
                    monitorSpectraData = {
                        qoA: qoA,
                        epsilonPA: epsilonPA
                    };
                }
            }
            
            if (spectra.length === 0) {
                const row = document.createElement('tr');
                row.innerHTML = '<td colspan="2" style="text-align: center; padding: 40px; color: var(--text-secondary);">Không có phổ lá dò nào trong container này</td>';
                tbody.appendChild(row);
            } else {
                // Get alpha value for Qo(a) calculation
                const alphaText = document.getElementById('calc-alpha-value')?.textContent.trim() || '-';
                const alpha = (alphaText !== '-' && alphaText !== '') ? parseFloat(alphaText) : null;
                const ecdA = parseFloat(document.getElementById('calc-ecd-a')?.value) || 0.55;
                
                // Default values for Qo and Er(a)
                const defaultQo = 15.7;
                const defaultErA = 5.65;
                
                spectra.forEach(spectrum => {
                    // Format datetime values before inserting into template
                    const startTimeFormatted = formatDateTime(spectrum.start_time);
                    const endTimeFormatted = formatDateTime(spectrum.end_time);
                    const measurementStartTimeFormatted = formatDateTime(spectrum.measurement_start_time);
                    
                    // Format epsilon_p_a value
                    let epsilonDisplay = '-';
                    if (spectrum.epsilon_p_a !== null && spectrum.epsilon_p_a !== undefined && spectrum.epsilon_p_a !== '') {
                        try {
                            const value = parseFloat(spectrum.epsilon_p_a);
                            if (!isNaN(value)) {
                                epsilonDisplay = value.toExponential(4);
                            }
                        } catch (e) {
                            console.error('Error formatting epsilon_p_a:', e, 'Value:', spectrum.epsilon_p_a);
                        }
                    }
                    
                    // Calculate Qo(a)
                    const qoA = calculateQoAForSpectrum(defaultQo, defaultErA, ecdA, alpha);
                    const qoADisplay = (qoA !== null) ? qoA.toFixed(6) : '-';
                    
                    // Calculate S(m), D(m), C(m)
                    const auTHalf = spectrum.au_t_half;
                    const totalIrradiationTime = spectrum.total_irradiation_time;
                    const decayTime = spectrum.decay_time;
                    const measurementDuration = spectrum.measurement_duration;
                    
                    let sM = '-';
                    let dM = '-';
                    let cM = '-';
                    let sMValue = null;
                    let dMValue = null;
                    let cMValue = null;
                    
                    if (auTHalf !== null && auTHalf !== undefined && !isNaN(auTHalf) && auTHalf > 0) {
                        const ln2_over_tHalf = Math.LN2 / auTHalf;
                        
                        // S(m) = 1 - EXP(-(LN(2)/T1/2_Au) * Tổng_thời_gian_chiếu)
                        if (totalIrradiationTime !== null && totalIrradiationTime !== undefined && !isNaN(totalIrradiationTime)) {
                            sMValue = 1 - Math.exp(-ln2_over_tHalf * totalIrradiationTime);
                            sM = sMValue.toFixed(6);
                        }
                        
                        // D(m) = EXP(-(LN(2)/T1/2_Au) * Thời_gian_rã)
                        if (decayTime !== null && decayTime !== undefined && !isNaN(decayTime)) {
                            dMValue = Math.exp(-ln2_over_tHalf * decayTime);
                            dM = dMValue.toFixed(6);
                        }
                        
                        // C(m) = (1 - EXP(-(LN(2)/T1/2_Au) * Thời_gian_đo)) / ((LN(2)/T1/2_Au) * Thời_gian_đo)
                        if (measurementDuration !== null && measurementDuration !== undefined && !isNaN(measurementDuration) && measurementDuration > 0) {
                            const denominator = ln2_over_tHalf * measurementDuration;
                            if (denominator !== 0) {
                                cMValue = (1 - Math.exp(-ln2_over_tHalf * measurementDuration)) / denominator;
                                cM = cMValue.toFixed(6);
                            }
                        }
                    }
                    
                    // Calculate Asp
                    // Asp = (Diện tích đỉnh / Thời gian đo) / (S(m) * D(m) * C(m) * (Khối lượng * 0.1 / 100))
                    // = (peak_area / measurement_duration) / (sM * dM * cM * (sample_mass * 0.001))
                    let asp = '-';
                    const peakArea = spectrum.peak_area;
                    const sampleMass = spectrum.sample_mass;
                    
                    if (peakArea !== null && peakArea !== undefined && !isNaN(peakArea) &&
                        measurementDuration !== null && measurementDuration !== undefined && !isNaN(measurementDuration) && measurementDuration > 0 &&
                        sMValue !== null && dMValue !== null && cMValue !== null &&
                        sampleMass !== null && sampleMass !== undefined && !isNaN(sampleMass) && sampleMass > 0) {
                        try {
                            const numerator = peakArea / measurementDuration;
                            const denominator = sMValue * dMValue * cMValue * (sampleMass * 0.001);
                            if (denominator !== 0) {
                                const aspValue = numerator / denominator;
                                asp = aspValue.toFixed(6);
                            }
                        } catch (e) {
                            console.error('Error calculating Asp:', e);
                        }
                    }
                    
                    // Calculate Thông lượng Neutron
                    // = (Asp * (197/((6.023*10^23)*(98.65*10^-24)*1*0.955) * f)) / ((f + Qo(a)) * ℰp,(a))
                    let neutronFlux = '-';
                    const fValueText = document.getElementById('calc-f-value')?.textContent.trim() || '-';
                    const fValue = (fValueText !== '-' && fValueText !== '') ? parseFloat(fValueText) : null;
                    const epsilonPA = spectrum.epsilon_p_a;
                    
                    if (asp !== '-' && fValue !== null && !isNaN(fValue) && 
                        qoA !== null && epsilonPA !== null && epsilonPA !== undefined && !isNaN(epsilonPA)) {
                        try {
                            // Constant = 197 / (6.023e23 * 98.65e-24 * 1 * 0.955)
                            const constant = 197 / (6.023e23 * 98.65e-24 * 1 * 0.955);
                            const aspValue = parseFloat(asp);
                            const numerator = aspValue * constant * fValue;
                            const denominator = (fValue + qoA) * epsilonPA;
                            if (denominator !== 0) {
                                const fluxValue = numerator / denominator;
                                neutronFlux = fluxValue.toExponential(4);
                            }
                        } catch (e) {
                            console.error('Error calculating Neutron Flux:', e);
                        }
                    }
                    
                    // Create summary row (always visible)
                    const summaryRow = document.createElement('tr');
                    summaryRow.className = 'monitor-spectrum-summary';
                    summaryRow.setAttribute('data-spectrum-name', spectrum.spectrum_name || '');
                    summaryRow.style.cursor = 'pointer';
                    summaryRow.style.borderBottom = '2px solid #e8ecef';
                    summaryRow.onclick = function() {
                        toggleMonitorSpectrumDetails(spectrum.spectrum_name || '');
                    };
                    summaryRow.innerHTML = `
                        <td style="padding: 18px 20px; border: 1px solid #e8ecef; vertical-align: middle;">
                            <span style="margin-right: 12px; font-weight: bold; font-size: 1.1em; color: #c62828; display: inline-block; width: 20px; text-align: center;">▶</span>
                            <span style="font-weight: 600; font-size: 1.05em; color: #2c3e50;">${spectrum.spectrum_name || '-'}</span>
                        </td>
                        <td style="padding: 18px 20px; border: 1px solid #e8ecef; text-align: center; vertical-align: middle;">
                            <span style="font-weight: 700; font-size: 1.15em; color: #c62828; letter-spacing: 0.5px;">${neutronFlux}</span>
                        </td>
                    `;
                    tbody.appendChild(summaryRow);
                    
                    // Create detail row (hidden by default)
                    const detailRow = document.createElement('tr');
                    detailRow.className = 'monitor-spectrum-details';
                    detailRow.setAttribute('data-spectrum-name', spectrum.spectrum_name || '');
                    detailRow.style.display = 'none';
                    detailRow.innerHTML = `
                        <td colspan="2" style="padding: 20px; background-color: #f9f9f9; border: 1px solid var(--border-color);">
                            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px;">
                                <div><strong>Vị trí đo:</strong> ${spectrum.measurement_position || '-'}</div>
                                <div><strong>Vị trí trong container:</strong> ${spectrum.position_in_container || '-'}</div>
                                <div><strong>Bắt đầu chiếu:</strong> ${startTimeFormatted}</div>
                                <div><strong>Kết thúc chiếu:</strong> ${endTimeFormatted}</div>
                                <div><strong>Tổng thời gian chiếu (s):</strong> ${formatValue(spectrum.total_irradiation_time, v => v.toFixed(2))}</div>
                                <div><strong>Bắt đầu đo:</strong> ${measurementStartTimeFormatted}</div>
                                <div><strong>Thời gian đo (s):</strong> ${formatValue(spectrum.measurement_duration, v => v.toFixed(2))}</div>
                                <div><strong>Khối lượng (g):</strong> ${formatValue(spectrum.sample_mass, v => v.toFixed(4))}</div>
                                <div><strong>Thời gian rã (s):</strong> ${formatValue(spectrum.decay_time, v => v.toFixed(2))}</div>
                                <div><strong>T1/2 Au:</strong> ${formatValue(spectrum.au_t_half, v => v.toFixed(4))}</div>
                                <div><strong>ℰ<sub>p</sub>,(a):</strong> ${epsilonDisplay}</div>
                                <div><strong>Diện tích đỉnh:</strong> ${formatValue(spectrum.peak_area, v => v.toFixed(2))}</div>
                                <div><strong>Q<sub>o</sub>:</strong> ${defaultQo.toFixed(1)}</div>
                                <div><strong>E<sub>r</sub>(a):</strong> ${defaultErA.toFixed(2)}</div>
                                <div><strong>Q<sub>o</sub>(a):</strong> ${qoADisplay}</div>
                                <div><strong>S(m):</strong> ${sM}</div>
                                <div><strong>D(m):</strong> ${dM}</div>
                                <div><strong>C(m):</strong> ${cM}</div>
                                <div><strong>A<sub>sp</sub>:</strong> ${asp}</div>
                            </div>
                        </td>
                    `;
                    tbody.appendChild(detailRow);
                });
            }
            
            monitorSpectraSection.style.display = 'block';
            
            // Draw regression chart
            drawNeutronFluxRegressionChart(spectra);
            
            // Load non-monitor spectra
            loadNonMonitorSpectra(containerName);
        } else {
            showToast('Lỗi khi tải danh sách phổ lá dò: ' + result.error, 'error');
            monitorSpectraSection.style.display = 'none';
            document.getElementById('calc-regression-chart-section').style.display = 'none';
            document.getElementById('calc-non-monitor-spectra-section').style.display = 'none';
        }
    } catch (error) {
        console.error('Error loading monitor spectra:', error);
        showToast('Lỗi khi tải danh sách phổ lá dò: ' + error.message, 'error');
        monitorSpectraSection.style.display = 'none';
        document.getElementById('calc-regression-chart-section').style.display = 'none';
        document.getElementById('calc-non-monitor-spectra-section').style.display = 'none';
    }
}

function toggleMonitorSpectrumDetails(spectrumName) {
    const tbody = document.getElementById('calc-monitor-spectra-tbody');
    if (!tbody) return;
    
    // Find the summary row and detail row for this spectrum
    const summaryRow = tbody.querySelector(`tr.monitor-spectrum-summary[data-spectrum-name="${spectrumName}"]`);
    const detailRow = tbody.querySelector(`tr.monitor-spectrum-details[data-spectrum-name="${spectrumName}"]`);
    
    if (!summaryRow || !detailRow) return;
    
    // Toggle display
    const isCurrentlyVisible = detailRow.style.display !== 'none';
    
    if (isCurrentlyVisible) {
        // Hide details
        detailRow.style.display = 'none';
        // Change icon to ▶
        const iconSpan = summaryRow.querySelector('td:first-child span');
        if (iconSpan) {
            iconSpan.textContent = '▶';
        }
    } else {
        // Show details
        detailRow.style.display = '';
        // Change icon to ▼
        const iconSpan = summaryRow.querySelector('td:first-child span');
        if (iconSpan) {
            iconSpan.textContent = '▼';
        }
    }
}

function formatValue(value, formatter) {
    if (value === null || value === undefined || value === '') {
        return '-';
    }
    try {
        return formatter(value);
    } catch (e) {
        return String(value);
    }
}

function calculateAspFromPosition(positionStr) {
    if (!currentRegressionCoefficients || !positionStr) {
        return null;
    }
    try {
        const match = positionStr.toString().match(/-?\d+\.?\d*/);
        if (!match) return null;
        const position = parseFloat(match[0]);
        if (isNaN(position)) return null;
        return currentRegressionCoefficients.a * position + currentRegressionCoefficients.b;
    } catch (e) {
        return null;
    }
}

function calculateRelativeConcentration({ element, spectrum, match, aspValue }) {
    if (!match) return { value: null, error: null };
    
    const samplePosition = (spectrum?.measurement_position || '').toString().trim();
    const standardPosition = (match?.measurement_position || '').toString().trim();
    if (!samplePosition || !standardPosition || samplePosition !== standardPosition) {
        return { value: null, error: 'Không thể tính do không cùng vị trí đo' };
    }
    
    const samplePeakArea = parseFloat(element?.peak_area);
    const sampleDuration = parseFloat(spectrum?.measurement_duration);
    const sampleDM = parseFloat(element?.d_m);
    const sampleCM = parseFloat(element?.c_m);
    const sampleMass = parseFloat(spectrum?.sample_mass);
    
    const standardPeakArea = parseFloat(match?.peak_area);
    const standardDuration = parseFloat(match?.measurement_duration);
    const standardDM = parseFloat(match?.d_m);
    const standardCM = parseFloat(match?.c_m);
    const standardMass = parseFloat(match?.sample_mass);
    const standardConcentration = parseFloat(match?.concentration);
    
    const standardAspValue = calculateAspFromPosition(match?.position_in_container || '');
    
    if (
        [samplePeakArea, sampleDuration, sampleDM, sampleCM, sampleMass, aspValue].some(v => v === null || v === undefined || isNaN(v) || v === 0) ||
        [standardPeakArea, standardDuration, standardDM, standardCM, standardMass, standardConcentration, standardAspValue].some(v => v === null || v === undefined || isNaN(v) || v === 0)
    ) {
        return { value: null, error: null };
    }
    
    try {
        const sampleTermNumerator = samplePeakArea / sampleDuration;
        const sampleTermDenominator = sampleDM * sampleCM * sampleMass * 1000;
        if (sampleTermDenominator === 0) return { value: null, error: null };
        const sampleTerm = sampleTermNumerator / sampleTermDenominator;
        
        const standardTermNumerator = standardPeakArea / standardDuration;
        const standardTermDenominator = standardDM * standardCM * standardMass * 1000 * standardConcentration;
        if (standardTermDenominator === 0) return { value: null, error: null };
        const standardTerm = standardTermNumerator / standardTermDenominator;
        if (standardTerm === 0) return { value: null, error: null };
        
        const aspRatio = standardAspValue / aspValue;
        if (!isFinite(aspRatio) || aspRatio === 0) return { value: null, error: null };
        
        return { value: (sampleTerm / standardTerm) * aspRatio, error: null };
    } catch (error) {
        console.error('Error calculating relative concentration:', error);
        return { value: null, error: null };
    }
}

// Calculate linear regression: y = ax + b
function calculateLinearRegression(dataPoints) {
    if (dataPoints.length < 2) {
        return null;
    }
    
    const n = dataPoints.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    
    dataPoints.forEach(point => {
        sumX += point.x;
        sumY += point.y;
        sumXY += point.x * point.y;
        sumX2 += point.x * point.x;
    });
    
    const meanX = sumX / n;
    const meanY = sumY / n;
    
    // Calculate slope (a) and intercept (b)
    const denominator = sumX2 - n * meanX * meanX;
    if (Math.abs(denominator) < 1e-10) {
        return null; // Avoid division by zero
    }
    
    const a = (sumXY - n * meanX * meanY) / denominator;
    const b = meanY - a * meanX;
    
    // Calculate R-squared
    let ssRes = 0, ssTot = 0;
    dataPoints.forEach(point => {
        const yPred = a * point.x + b;
        ssRes += Math.pow(point.y - yPred, 2);
        ssTot += Math.pow(point.y - meanY, 2);
    });
    const rSquared = ssTot > 0 ? 1 - (ssRes / ssTot) : 0;
    
    return { a, b, rSquared };
}

function drawNeutronFluxRegressionChart(spectra) {
    const chartSection = document.getElementById('calc-regression-chart-section');
    if (!chartSection) return;
    
    // Get calculation parameters
    const alphaText = document.getElementById('calc-alpha-value')?.textContent.trim() || '-';
    const alpha = (alphaText !== '-' && alphaText !== '') ? parseFloat(alphaText) : null;
    const ecdA = parseFloat(document.getElementById('calc-ecd-a')?.value) || 0.55;
    const fValueText = document.getElementById('calc-f-value')?.textContent.trim() || '-';
    const fValue = (fValueText !== '-' && fValueText !== '') ? parseFloat(fValueText) : null;
    const defaultQo = 15.7;
    const defaultErA = 5.65;
    
    // Collect data points for chart: position in container (x) vs neutron flux (y)
    const dataPoints = [];
    // Collect data points for regression: position in container (x) vs Asp (y)
    const aspDataPoints = [];
    
    spectra.forEach(spectrum => {
        const positionStr = spectrum.position_in_container || '';
        
        // Extract position number from position_in_container
        let position = null;
        if (positionStr) {
            const numMatch = positionStr.toString().match(/-?\d+\.?\d*/);
            if (numMatch) {
                position = parseFloat(numMatch[0]);
            }
        }
        
        // Recalculate neutron flux
        let neutronFlux = null;
        
        // Calculate Qo(a)
        const qoA = calculateQoAForSpectrum(defaultQo, defaultErA, ecdA, alpha);
        
        // Calculate S(m), D(m), C(m) for Asp
        const auTHalf = spectrum.au_t_half;
        const totalIrradiationTime = spectrum.total_irradiation_time;
        const decayTime = spectrum.decay_time;
        const measurementDuration = spectrum.measurement_duration;
        const peakArea = spectrum.peak_area;
        const sampleMass = spectrum.sample_mass;
        const epsilonPA = spectrum.epsilon_p_a;
        
        let sMValue = null, dMValue = null, cMValue = null;
        
        if (auTHalf !== null && auTHalf !== undefined && !isNaN(auTHalf) && auTHalf > 0) {
            const ln2_over_tHalf = Math.LN2 / auTHalf;
            
            if (totalIrradiationTime !== null && totalIrradiationTime !== undefined && !isNaN(totalIrradiationTime)) {
                sMValue = 1 - Math.exp(-ln2_over_tHalf * totalIrradiationTime);
            }
            if (decayTime !== null && decayTime !== undefined && !isNaN(decayTime)) {
                dMValue = Math.exp(-ln2_over_tHalf * decayTime);
            }
            if (measurementDuration !== null && measurementDuration !== undefined && !isNaN(measurementDuration) && measurementDuration > 0) {
                const denominator = ln2_over_tHalf * measurementDuration;
                if (denominator !== 0) {
                    cMValue = (1 - Math.exp(-ln2_over_tHalf * measurementDuration)) / denominator;
                }
            }
        }
        
        // Calculate Asp
        let aspValue = null;
        if (peakArea !== null && peakArea !== undefined && !isNaN(peakArea) &&
            measurementDuration !== null && measurementDuration !== undefined && !isNaN(measurementDuration) && measurementDuration > 0 &&
            sMValue !== null && dMValue !== null && cMValue !== null &&
            sampleMass !== null && sampleMass !== undefined && !isNaN(sampleMass) && sampleMass > 0) {
            try {
                const numerator = peakArea / measurementDuration;
                const denominator = sMValue * dMValue * cMValue * (sampleMass * 0.001);
                if (denominator !== 0) {
                    aspValue = numerator / denominator;
                }
            } catch (e) {
                console.error('Error calculating Asp:', e);
            }
        }
        
        // Calculate Neutron Flux
        if (aspValue !== null && fValue !== null && !isNaN(fValue) && 
            qoA !== null && epsilonPA !== null && epsilonPA !== undefined && !isNaN(epsilonPA)) {
            try {
                const constant = 197 / (6.023e23 * 98.65e-24 * 1 * 0.955);
                const numerator = aspValue * constant * fValue;
                const denominator = (fValue + qoA) * epsilonPA;
                if (denominator !== 0) {
                    neutronFlux = numerator / denominator;
                }
            } catch (e) {
                console.error('Error calculating Neutron Flux:', e);
            }
        }
        
        // Add to neutron flux data points for chart
        if (position !== null && !isNaN(position) && neutronFlux !== null && !isNaN(neutronFlux)) {
            dataPoints.push({ x: position, y: neutronFlux, label: spectrum.spectrum_name });
        }
        
        // Add to Asp data points for regression calculation
        if (position !== null && !isNaN(position) && aspValue !== null && !isNaN(aspValue)) {
            aspDataPoints.push({ x: position, y: aspValue, label: spectrum.spectrum_name });
        }
    });
    
    // If we don't have enough data points, hide chart
    if (dataPoints.length < 2 || aspDataPoints.length < 2) {
        chartSection.style.display = 'none';
        currentRegressionCoefficients = null; // Clear coefficients if not enough data
        return;
    }
    
    // Calculate linear regression from Asp values for equation display and calculation
    const aspRegression = calculateLinearRegression(aspDataPoints);
    if (!aspRegression) {
        chartSection.style.display = 'none';
        currentRegressionCoefficients = null; // Clear coefficients if no regression
        return;
    }
    
    // Store regression coefficients globally for Asp calculation (used in non-monitor spectra)
    currentRegressionCoefficients = {
        a: aspRegression.a,
        b: aspRegression.b
    };
    
    // Calculate linear regression from neutron flux values for chart display
    const neutronFluxRegression = calculateLinearRegression(dataPoints);
    if (!neutronFluxRegression) {
        chartSection.style.display = 'none';
        return;
    }
    
    // Prepare data for Chart.js
    const xValues = dataPoints.map(p => p.x);
    const yValues = dataPoints.map(p => p.y);
    const minX = Math.min(...xValues);
    const maxX = Math.max(...xValues);
    
    // Generate regression line points for neutron flux chart
    // Use neutron flux regression for the line on chart
    const regressionLineX = [minX - (maxX - minX) * 0.1, maxX + (maxX - minX) * 0.1];
    const regressionLineY = regressionLineX.map(x => neutronFluxRegression.a * x + neutronFluxRegression.b);
    
    // Destroy existing chart if it exists
    if (neutronFluxChart) {
        neutronFluxChart.destroy();
    }
    
    // Create new chart
    const ctx = document.getElementById('neutron-flux-chart');
    if (!ctx) return;
    
    neutronFluxChart = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [
                {
                    label: 'Thông lượng Neutron',
                    data: dataPoints.map(p => ({ x: p.x, y: p.y })),
                    backgroundColor: 'rgba(39, 174, 96, 0.6)',
                    borderColor: 'rgba(39, 174, 96, 1)',
                    pointRadius: 8,
                    pointHoverRadius: 10,
                    pointBorderWidth: 2,
                    pointBorderColor: '#fff'
                },
                {
                    label: 'Đường tuyến tính',
                    data: regressionLineX.map((x, i) => ({ x: x, y: regressionLineY[i] })),
                    type: 'line',
                    borderColor: 'rgba(52, 152, 219, 1)',
                    borderWidth: 2,
                    fill: false,
                    pointRadius: 0,
                    pointHoverRadius: 0,
                    tension: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            aspectRatio: 2,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                },
                tooltip: {
                    callbacks: {
                        label: (function(fluxReg) {
                            return function(context) {
                                if (context.datasetIndex === 0) {
                                    const point = dataPoints[context.dataIndex];
                                    return `${point.label}: (${point.x.toFixed(2)}, ${point.y.toExponential(4)})`;
                                } else {
                                    return `y = ${fluxReg.a.toFixed(6)}x + ${fluxReg.b.toExponential(4)}`;
                                }
                            };
                        })(neutronFluxRegression)
                    }
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Vị trí trong container',
                        font: {
                            size: 14,
                            weight: 'bold'
                        }
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.1)'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Thông lượng Neutron',
                        font: {
                            size: 14,
                            weight: 'bold'
                        }
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.1)'
                    }
                }
            }
        }
    });
    
    // Display regression equation and coefficients (from Asp, not neutron flux)
    const formulaDiv = document.getElementById('regression-formula');
    const coefficientsDiv = document.getElementById('regression-coefficients');
    
    if (formulaDiv) {
        formulaDiv.innerHTML = `
            <span style="color: #2c3e50;">Asp = </span>
            <span style="color: #c62828; font-weight: 700;">${aspRegression.a.toFixed(6)}</span>
            <span style="color: #2c3e50;"> × position + </span>
            <span style="color: #c62828; font-weight: 700;">${aspRegression.b.toExponential(4)}</span>
        `;
    }
    
    if (coefficientsDiv) {
        coefficientsDiv.innerHTML = `
            <div style="background: white; padding: 12px; border-radius: 4px; border: 1px solid #e0e0e0;">
                <strong style="color: #7f8c8d; font-size: 0.9em;">Hệ số góc (a):</strong>
                <div style="font-size: 1.2em; font-weight: 700; color: #c62828; margin-top: 5px;">
                    ${aspRegression.a.toFixed(6)}
                </div>
            </div>
            <div style="background: white; padding: 12px; border-radius: 4px; border: 1px solid #e0e0e0;">
                <strong style="color: #7f8c8d; font-size: 0.9em;">Hệ số chặn (b):</strong>
                <div style="font-size: 1.2em; font-weight: 700; color: #c62828; margin-top: 5px;">
                    ${aspRegression.b.toExponential(4)}
                </div>
            </div>
            <div style="background: white; padding: 12px; border-radius: 4px; border: 1px solid #e0e0e0;">
                <strong style="color: #7f8c8d; font-size: 0.9em;">Hệ số xác định (R²):</strong>
                <div style="font-size: 1.2em; font-weight: 700; color: #c62828; margin-top: 5px;">
                    ${aspRegression.rSquared.toFixed(6)}
                </div>
            </div>
        `;
    }
    
    // Show chart section
    chartSection.style.display = 'block';
}

async function loadNonMonitorSpectra(containerName) {
    const section = document.getElementById('calc-non-monitor-spectra-section');
    const container = document.getElementById('calc-non-monitor-spectra-container');
    
    // Reset snapshot kết quả tính toán hiện tại
    currentCalculationResultsForSaving = [];
    
    if (!containerName) {
        section.style.display = 'none';
        return;
    }
    
    try {
        const response = await fetch(`/api/calculation/non-monitor-spectra?container_name=${encodeURIComponent(containerName)}`);
        const result = await response.json();
        
        if (result.success) {
            const spectra = result.data;
            container.innerHTML = '';
            
            if (spectra.length === 0) {
                container.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-secondary); background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.08);">Không có phổ mẫu nào trong container này</div>';
                section.style.display = 'block';
                return;
            }
            
            // Get calculation parameters for Qo(a)
            const alphaText = document.getElementById('calc-alpha-value')?.textContent.trim() || '-';
            const alpha = (alphaText !== '-' && alphaText !== '') ? parseFloat(alphaText) : null;
            const ecdA = parseFloat(document.getElementById('calc-ecd-a')?.value) || 0.55;
            const defaultQo = 15.7;
            const defaultErA = 5.65;
            
            spectra.forEach(spectrum => {
                // Create spectrum card
                const spectrumCard = document.createElement('div');
                spectrumCard.className = 'non-monitor-spectrum-card';
                spectrumCard.style.cssText = 'background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.08); margin-bottom: 20px; overflow: hidden;';
                
                // Summary row (clickable)
                const summaryRow = document.createElement('div');
                summaryRow.className = 'non-monitor-spectrum-summary';
                summaryRow.style.cssText = 'padding: 18px 20px; cursor: pointer; border-bottom: 2px solid #e8ecef; display: flex; justify-content: space-between; align-items: center; transition: background-color 0.3s ease;';
                summaryRow.onclick = function() {
                    toggleNonMonitorSpectrumDetails(spectrum.spectrum_name);
                };
                summaryRow.onmouseover = function() {
                    this.style.backgroundColor = '#f8f9fa';
                };
                summaryRow.onmouseout = function() {
                    this.style.backgroundColor = 'white';
                };
                
                summaryRow.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <span style="font-weight: bold; font-size: 1.1em; color: #c62828; display: inline-block; width: 20px; text-align: center;">▶</span>
                        <span style="font-weight: 600; font-size: 1.05em; color: #2c3e50;">${spectrum.spectrum_name || '-'}</span>
                    </div>
                    <div style="color: #7f8c8d; font-size: 0.9em;">
                        ${spectrum.elements ? spectrum.elements.length : 0} nguyên tố
                    </div>
                `;
                
                // Details row (hidden by default)
                const detailsRow = document.createElement('div');
                detailsRow.className = 'non-monitor-spectrum-details';
                detailsRow.setAttribute('data-spectrum-name', spectrum.spectrum_name || '');
                detailsRow.style.display = 'none';
                detailsRow.style.padding = '25px';
                detailsRow.style.backgroundColor = '#f9f9f9';
                
                // Calculate Asp (lá dò) using regression coefficients
                let aspValue = calculateAspFromPosition(spectrum.position_in_container || '');
                let aspDisplay = aspValue !== null && !isNaN(aspValue) ? aspValue.toExponential(4) : '-';
                
                // Basic info section
                const basicInfoHtml = `
                        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin-bottom: 25px; padding-bottom: 20px; border-bottom: 2px solid #e0e0e0;">
                        <div><strong>Vị trí đo:</strong> ${spectrum.measurement_position || '-'}</div>
                        <div><strong>Vị trí trong container:</strong> ${spectrum.position_in_container || '-'}</div>
                        <div><strong>Bắt đầu chiếu:</strong> ${formatDateTime(spectrum.start_time)}</div>
                        <div><strong>Kết thúc chiếu:</strong> ${formatDateTime(spectrum.end_time)}</div>
                        <div><strong>Tổng thời gian chiếu (s):</strong> ${formatValue(spectrum.total_irradiation_time, v => v.toFixed(2))}</div>
                        <div><strong>Bắt đầu đo:</strong> ${formatDateTime(spectrum.measurement_start_time)}</div>
                        <div><strong>Thời gian đo (s):</strong> ${formatValue(spectrum.measurement_duration, v => v.toFixed(2))}</div>
                        <div><strong>Khối lượng (g):</strong> ${formatValue(spectrum.sample_mass, v => v.toFixed(4))}</div>
                        <div><strong>Thời gian rã (s):</strong> ${formatValue(spectrum.decay_time, v => v.toFixed(2))}</div>
                        <div><strong>A<sub>sp</sub> (lá dò):</strong> <span style="color: #c62828; font-weight: 600;">${aspDisplay}</span></div>
                    </div>
                        ${(() => {
                            if (!spectrum.standard_samples || spectrum.standard_samples.length === 0) {
                                return '';
                            }
                            const cards = spectrum.standard_samples.map(std => {
                                const displayName = std.standard_sample_name || std.sample_name || '-';
                                return `
                                    <div style="background: white; border: 1px solid #e0e0e0; border-radius: 6px; padding: 12px;">
                                        <div style="font-weight: 600; color: #2c3e50;">${displayName}</div>
                                        <div style="color: #7f8c8d; font-size: 0.85em;">Phổ: ${std.spectrum_name || '-'}</div>
                                        <div>Khối lượng: ${formatValue(std.sample_mass, v => v.toFixed(4))} g</div>
                                        <div>Bắt đầu đo: ${formatDateTime(std.measurement_start_time)}</div>
                                        <div>Thời lượng đo: ${formatValue(std.measurement_duration, v => v.toFixed(2))} s</div>
                                    </div>
                                `;
                            }).join('');
                            return `
                                <div style="margin-top: 10px; margin-bottom: 25px;">
                                    <h4 style="margin: 0 0 10px 0; color: var(--text-color); font-size: 1.05em;">
                                        <i class="fas fa-balance-scale"></i> Mẫu chuẩn tham chiếu
                                    </h4>
                                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px;">
                                        ${cards}
                                    </div>
                                </div>
                            `;
                        })()}
                `;
                
                // Elements table - Simplified view with only 5 columns
                let elementsTableHtml = '';
                if (spectrum.elements && spectrum.elements.length > 0) {
                    elementsTableHtml = `
                        <h4 style="margin: 0 0 15px 0; color: var(--text-color); font-size: 1.1em;">
                            <i class="fas fa-list"></i> Danh sách Nguyên tố
                        </h4>
                        <div style="overflow-x: auto;">
                            <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 6px; overflow: hidden;">
                                <thead>
                                    <tr style="background: linear-gradient(135deg, var(--primary-color) 0%, var(--primary-dark) 100%); color: white;">
                                        <th style="padding: 12px; text-align: left; border: 1px solid rgba(255,255,255,0.2);">Nguyên tố</th>
                                        <th style="padding: 12px; text-align: center; border: 1px solid rgba(255,255,255,0.2);">Năng lượng (keV)</th>
                                        <th style="padding: 12px; text-align: right; border: 1px solid rgba(255,255,255,0.2);">Hàm lượng (K<sub>0</sub>)</th>
                                        <th style="padding: 12px; text-align: left; border: 1px solid rgba(255,255,255,0.2);">Tên mẫu chuẩn</th>
                                        <th style="padding: 12px; text-align: right; border: 1px solid rgba(255,255,255,0.2);">Hàm lượng (tương đối)</th>
                                        <th style="padding: 12px; text-align: center; border: 1px solid rgba(255,255,255,0.2); width: 120px;">Thao tác</th>
                                    </tr>
                                </thead>
                                <tbody>
                    `;
                    
                    // Get calculation parameters for concentration
                    const gthM = parseFloat(document.getElementById('calc-gth-m')?.value) || 1;
                    const geM = parseFloat(document.getElementById('calc-ge-m')?.value) || 1;
                    const fValueText = document.getElementById('calc-f-value')?.textContent.trim() || '-';
                    const fValue = (fValueText !== '-' && fValueText !== '') ? parseFloat(fValueText) : null;
                    
                    spectrum.elements.forEach((element, elementIndex) => {
                        // Calculate Qo(a) for this element
                        const q0 = element.q0;
                        const er = element.er;
                        let qoA = null;
                        
                        if (q0 !== null && er !== null && alpha !== null && ecdA !== null) {
                            try {
                                qoA = calculateQoAForSpectrum(q0, er, ecdA, alpha);
                            } catch (e) {
                                console.error('Error calculating Qo(a) for element:', e);
                            }
                        }
                        
                        // Format epsilon_p_a
                        let epsilonDisplay = '-';
                        let epsilonPAValue = null;
                        if (element.epsilon_p_a !== null && element.epsilon_p_a !== undefined) {
                            try {
                                const value = parseFloat(element.epsilon_p_a);
                                if (!isNaN(value)) {
                                    epsilonPAValue = value;
                                    epsilonDisplay = value.toExponential(4);
                                }
                            } catch (e) {
                                console.error('Error formatting epsilon_p_a:', e);
                            }
                        }
                        
                        // Calculate Hàm lượng (tính bằng K0)
                        // Formula: ((((Diện tích đỉnh/Thời gian đo)/(S(m)*D(m)*C(m)*Khối lượng))/Asp) * (1/K0) * (((Gth,(m)*f + Ge,(m)*Qo(a)_lá dò) * ℰp,(a)_lá dò) / ((Gth,(m)*f + Ge,(m)*Qo(a)_nguyên tố) * ℰp,(a)_nguyên tố))) * 10^6
                        let concentration = null;
                        let concentrationDisplay = '-';
                        
                        if (aspValue !== null && !isNaN(aspValue) && aspValue > 0 &&
                            element.peak_area !== null && !isNaN(element.peak_area) &&
                            spectrum.measurement_duration !== null && !isNaN(spectrum.measurement_duration) && spectrum.measurement_duration > 0 &&
                            element.s_m !== null && !isNaN(element.s_m) && element.s_m > 0 &&
                            element.d_m !== null && !isNaN(element.d_m) && element.d_m > 0 &&
                            element.c_m !== null && !isNaN(element.c_m) && element.c_m > 0 &&
                            spectrum.sample_mass !== null && !isNaN(spectrum.sample_mass) && spectrum.sample_mass > 0 &&
                            element.k0 !== null && !isNaN(element.k0) && element.k0 > 0 &&
                            fValue !== null && !isNaN(fValue) &&
                            monitorSpectraData !== null &&
                            qoA !== null && !isNaN(qoA) &&
                            epsilonPAValue !== null && !isNaN(epsilonPAValue)) {
                            
                            try {
                                // Part 1: (Diện tích đỉnh / Thời gian đo) / (S(m) * D(m) * C(m) * Khối lượng)
                                const numerator1 = element.peak_area / spectrum.measurement_duration;
                                const denominator1 = element.s_m * element.d_m * element.c_m * spectrum.sample_mass;
                                if (denominator1 !== 0) {
                                    const part1 = numerator1 / denominator1;
                                    
                                    // Part 2: part1 / Asp
                                    const part2 = part1 / aspValue;
                                    
                                    // Part 3: part2 * (1 / K0)
                                    const part3 = part2 * (1 / element.k0);
                                    
                                    // Part 4: ((Gth,(m) * f + Ge,(m) * Qo(a)_lá dò) * ℰp,(a)_lá dò) / ((Gth,(m) * f + Ge,(m) * Qo(a)_nguyên tố) * ℰp,(a)_nguyên tố)
                                    const numerator2 = (gthM * fValue + geM * monitorSpectraData.qoA) * monitorSpectraData.epsilonPA;
                                    const denominator2 = (gthM * fValue + geM * qoA) * epsilonPAValue;
                                    
                                    if (denominator2 !== 0) {
                                        const part4 = numerator2 / denominator2;
                                        
                                        // Final: part3 * part4 * 10^6
                                        concentration = part3 * part4 * 1e6;
                                        concentrationDisplay = concentration.toFixed(2);
                                    }
                                }
                            } catch (e) {
                                console.error('Error calculating concentration:', e);
                            }
                        }
                        
                        // Đảm bảo luôn hiển thị ít nhất một dòng cho mỗi nguyên tố
                        // Nếu có relative matches thì hiển thị từng match, nếu không thì hiển thị một dòng với match = null
                        // Quan trọng: Nếu có concentration (Hàm lượng K0) thì luôn hiển thị, dù có relative matches hay không
                        const relativeMatches = element.relative_standard_matches && Array.isArray(element.relative_standard_matches) && element.relative_standard_matches.length > 0
                            ? element.relative_standard_matches
                            : [null]; // Nếu không có matches, tạo một match null để vẫn hiển thị dòng
                        
                        // Lặp qua các matches (hoặc một match null nếu không có)
                        relativeMatches.forEach((match, matchIndex) => {
                            const relativeResult = calculateRelativeConcentration({
                                element,
                                spectrum,
                                match,
                                aspValue
                            });
                            const relativeDisplay = relativeResult?.error
                                ? `<span style="color: #e67e22; font-style: italic;">${relativeResult.error}</span>`
                                : (relativeResult?.value !== null && relativeResult?.value !== undefined && !isNaN(relativeResult.value)
                                    ? relativeResult.value.toFixed(2)
                                    : '-');
                            
                            // Create unique ID for details modal
                            const detailsId = `details-${spectrum.spectrum_name}-${elementIndex}-${matchIndex}`.replace(/[^a-zA-Z0-9-]/g, '-');
                            
                            // Store full element data for details modal
                            const elementDataKey = `elementData_${detailsId}`;
                            window[elementDataKey] = {
                                element,
                                spectrum,
                                match,
                                qoA,
                                epsilonDisplay,
                                epsilonPAValue,
                                concentration,
                                concentrationDisplay,
                                relativeResult,
                                relativeDisplay,
                                aspValue
                            };
                            
                            // Lưu snapshot dòng kết quả để có thể copy sang module "Lưu kết quả tính toán"
                            currentCalculationResultsForSaving.push({
                                sample_name: spectrum.sample_name || '',
                                spectrum_name: spectrum.spectrum_name || '',
                                element_name: element.element_name || '',
                                energy: element.energy ?? null,
                                k0_concentration: concentration,
                                relative_concentration: (relativeResult && typeof relativeResult.value === 'number' && !isNaN(relativeResult.value))
                                    ? relativeResult.value
                                    : null,
                                relative_standard_name: match ? (match.standard_sample_name || '') : '',
                                // Lưu thêm tên phổ chuẩn để hiển thị rõ trong module "Lưu kết quả tính toán"
                                relative_standard_spectrum_name: match ? (match.spectrum_name || '') : ''
                            });
                            
                            // Luôn hiển thị dòng cho mỗi nguyên tố
                            // Nếu có concentration thì hiển thị giá trị, nếu không thì hiển thị '-'
                            // Format display với đơn vị ppm (chỉ thêm nếu không phải là '-' hoặc error)
                            const concentrationDisplayWithUnit = concentrationDisplay !== '-' && !concentrationDisplay.includes('error') && !concentrationDisplay.includes('Error')
                                ? `${concentrationDisplay} ppm`
                                : concentrationDisplay;
                            const relativeDisplayWithUnit = relativeDisplay !== '-' && !relativeDisplay.includes('error') && !relativeDisplay.includes('Error') && !relativeDisplay.includes('<span')
                                ? `${relativeDisplay} ppm`
                                : relativeDisplay;
                            
                            elementsTableHtml += `
                            <tr style="border-bottom: 1px solid #e8ecef;">
                                <td style="padding: 12px; border: 1px solid #e8ecef; font-weight: 600; color: #2c3e50;">${element.element_name || '-'}</td>
                                <td style="padding: 12px; border: 1px solid #e8ecef; text-align: center;">${formatValue(element.energy, v => v.toFixed(2))}</td>
                                <td style="padding: 12px; border: 1px solid #e8ecef; text-align: right; font-weight: 600; color: #c62828;">${concentrationDisplayWithUnit}</td>
                                <td style="padding: 12px; border: 1px solid #e8ecef;">
                                    ${
                                        match
                                            ? (match.standard_sample_name
                                                ? (match.spectrum_name
                                                    ? `${match.standard_sample_name} (${match.spectrum_name})`
                                                    : match.standard_sample_name)
                                                : '-')
                                            : '<span style="color: var(--text-secondary); font-style: italic;">Không có</span>'
                                    }
                                </td>
                                <td style="padding: 12px; border: 1px solid #e8ecef; text-align: right; font-weight: 600; color: #c62828;">${relativeDisplayWithUnit}</td>
                                <td style="padding: 12px; border: 1px solid #e8ecef; text-align: center;">
                                    <button onclick="showElementDetails('${detailsId}')" style="background: var(--primary-color); color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 0.9em; transition: all 0.3s; box-shadow: 0 2px 6px rgba(198, 40, 40, 0.3);" onmouseover="this.style.background='#b71c1c'; this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(198, 40, 40, 0.4)'" onmouseout="this.style.background='var(--primary-color)'; this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 6px rgba(198, 40, 40, 0.3)'">
                                        <i class="fas fa-info-circle"></i> Chi tiết
                                    </button>
                                </td>
                            </tr>
                        `;
                        });
                    });
                    
                    elementsTableHtml += `
                                </tbody>
                            </table>
                        </div>
                    `;
                } else {
                    elementsTableHtml = '<div style="text-align: center; padding: 20px; color: var(--text-secondary);">Không có dữ liệu nguyên tố</div>';
                }
                
                detailsRow.innerHTML = basicInfoHtml + elementsTableHtml;
                
                spectrumCard.appendChild(summaryRow);
                spectrumCard.appendChild(detailsRow);
                container.appendChild(spectrumCard);
            });
            
            section.style.display = 'block';
        } else {
            showToast('Lỗi khi tải danh sách phổ mẫu: ' + result.error, 'error');
            section.style.display = 'none';
        }
    } catch (error) {
        console.error('Error loading non-monitor spectra:', error);
        showToast('Lỗi khi tải danh sách phổ mẫu: ' + error.message, 'error');
        section.style.display = 'none';
    }
}

function toggleNonMonitorSpectrumDetails(spectrumName) {
    const container = document.getElementById('calc-non-monitor-spectra-container');
    if (!container) return;
    
    // Find the details row for this spectrum
    const detailsRow = container.querySelector(`.non-monitor-spectrum-details[data-spectrum-name="${spectrumName}"]`);
    if (!detailsRow) return;
    
    // Find the correct summary row (the one that's a sibling of detailsRow)
    const spectrumCard = detailsRow.parentElement;
    const correctSummaryRow = spectrumCard.querySelector('.non-monitor-spectrum-summary');
    
    if (!correctSummaryRow) return;
    
    // Toggle display
    const isCurrentlyVisible = detailsRow.style.display !== 'none';
    
    if (isCurrentlyVisible) {
        // Hide details
        detailsRow.style.display = 'none';
        // Change icon to ▶
        const iconSpan = correctSummaryRow.querySelector('span');
        if (iconSpan) {
            iconSpan.textContent = '▶';
        }
    } else {
        // Show details
        detailsRow.style.display = '';
        // Change icon to ▼
        const iconSpan = correctSummaryRow.querySelector('span');
        if (iconSpan) {
            iconSpan.textContent = '▼';
        }
    }
}

function showElementDetails(detailsId) {
    // Get stored element data
    const elementDataKey = `elementData_${detailsId}`;
    const data = window[elementDataKey];
    
    if (!data) {
        showToast('Không tìm thấy dữ liệu chi tiết', 'error');
        return;
    }
    
    const { element, spectrum, match, qoA, epsilonDisplay, concentrationDisplay, relativeDisplay } = data;
    
    // Create modal HTML
    const modalHtml = `
        <div id="element-details-modal" class="modal active">
            <div class="modal-content" style="max-width: 90%; max-height: 90vh; overflow-y: auto;">
                <div class="modal-header">
                    <h3>Chi tiết các thông số - ${element.element_name || '-'} (${formatValue(element.energy, v => v.toFixed(2))} keV)</h3>
                    <span class="close" onclick="closeElementDetailsModal()" style="cursor: pointer;">&times;</span>
                </div>
                <div class="modal-body" style="padding: 25px;">
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-bottom: 25px;">
                        <div style="background: #f8f9fa; padding: 15px; border-radius: 6px;">
                            <h4 style="margin: 0 0 15px 0; color: var(--primary-color); border-bottom: 2px solid var(--primary-color); padding-bottom: 8px;">
                                <i class="fas fa-atom"></i> Thông tin Nguyên tố
                            </h4>
                            <div style="display: grid; gap: 10px;">
                                <div><strong>Nguyên tố:</strong> ${element.element_name || '-'}</div>
                                <div><strong>Năng lượng (keV):</strong> ${formatValue(element.energy, v => v.toFixed(2))}</div>
                                <div><strong>Diện tích đỉnh:</strong> ${formatValue(element.peak_area, v => v.toFixed(2))}</div>
                                <div><strong>K<sub>0</sub>:</strong> ${formatValue(element.k0, v => v.toExponential(4))}</div>
                                <div><strong>T1/2:</strong> ${formatValue(element.t_half, v => v.toFixed(4))}</div>
                                <div><strong>Q<sub>0</sub>:</strong> ${formatValue(element.q0, v => v.toFixed(6))}</div>
                                <div><strong>Er:</strong> ${formatValue(element.er, v => v.toFixed(4))}</div>
                            </div>
                        </div>
                        
                        <div style="background: #f8f9fa; padding: 15px; border-radius: 6px;">
                            <h4 style="margin: 0 0 15px 0; color: var(--primary-color); border-bottom: 2px solid var(--primary-color); padding-bottom: 8px;">
                                <i class="fas fa-calculator"></i> Thông số Tính toán
                            </h4>
                            <div style="display: grid; gap: 10px;">
                                <div><strong>S(m):</strong> ${formatValue(element.s_m, v => v.toFixed(6))}</div>
                                <div><strong>D(m):</strong> ${formatValue(element.d_m, v => v.toFixed(6))}</div>
                                <div><strong>C(m):</strong> ${formatValue(element.c_m, v => v.toFixed(6))}</div>
                                <div><strong>ℰ<sub>p</sub>,(a):</strong> ${epsilonDisplay}</div>
                                <div><strong>Q<sub>o</sub>(a):</strong> ${formatValue(qoA, v => v.toFixed(6))}</div>
                            </div>
                        </div>
                    </div>
                    
                    <div style="background: linear-gradient(135deg, rgba(198, 40, 40, 0.05) 0%, rgba(198, 40, 40, 0.02) 100%); padding: 15px; border-radius: 6px; margin-bottom: 25px; border-left: 4px solid #c62828; box-shadow: 0 2px 8px rgba(198, 40, 40, 0.1);">
                        <h4 style="margin: 0 0 15px 0; color: #c62828; border-bottom: 2px solid #c62828; padding-bottom: 8px;">
                            <i class="fas fa-chart-line"></i> Kết quả Hàm lượng
                        </h4>
                        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px;">
                            <div>
                                <strong>Hàm lượng (K<sub>0</sub>):</strong>
                                <div style="font-size: 1.2em; font-weight: 600; color: #c62828; margin-top: 5px;">
                                    ${(() => {
                                        if (concentrationDisplay === '-' || concentrationDisplay.includes('error') || concentrationDisplay.includes('Error')) {
                                            return concentrationDisplay;
                                        }
                                        return `${concentrationDisplay} ppm`;
                                    })()}
                                </div>
                            </div>
                            <div>
                                <strong>Hàm lượng (tương đối):</strong>
                                <div style="font-size: 1.2em; font-weight: 600; color: #c62828; margin-top: 5px;">
                                    ${(() => {
                                        if (relativeDisplay === '-' || relativeDisplay.includes('error') || relativeDisplay.includes('Error') || relativeDisplay.includes('<span')) {
                                            return relativeDisplay;
                                        }
                                        return `${relativeDisplay} ppm`;
                                    })()}
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    ${match ? `
                    <div style="background: #fff3e0; padding: 15px; border-radius: 6px; border-left: 4px solid #ff9800;">
                        <h4 style="margin: 0 0 15px 0; color: #ff9800; border-bottom: 2px solid #ff9800; padding-bottom: 8px;">
                            <i class="fas fa-balance-scale"></i> Thông tin Mẫu chuẩn
                        </h4>
                        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px;">
                            <div><strong>Tên mẫu chuẩn:</strong> ${match.standard_sample_name || '-'}</div>
                            <div><strong>Phổ mẫu chuẩn:</strong> ${match.spectrum_name || '-'}</div>
                            <div><strong>Diện tích đỉnh chuẩn:</strong> ${formatValue(match.peak_area, v => v.toFixed(2))}</div>
                            <div><strong>D(m) chuẩn:</strong> ${formatValue(match.d_m, v => v.toFixed(6))}</div>
                            <div><strong>C(m) chuẩn:</strong> ${formatValue(match.c_m, v => v.toFixed(6))}</div>
                            <div><strong>Hàm lượng chuẩn (ppm):</strong> ${formatValue(match.concentration, v => v.toFixed(2))}</div>
                        </div>
                    </div>
                    ` : `
                    <div style="background: #f5f5f5; padding: 15px; border-radius: 6px; text-align: center; color: var(--text-secondary);">
                        <i class="fas fa-info-circle"></i> Không có mẫu chuẩn tương ứng
                    </div>
                    `}
                </div>
                <div class="modal-footer" style="padding: 15px 25px; border-top: 1px solid #e0e0e0; text-align: right;">
                    <button onclick="closeElementDetailsModal()" class="btn btn-secondary">Đóng</button>
                </div>
            </div>
        </div>
    `;
    
    // Remove existing modal if any
    const existingModal = document.getElementById('element-details-modal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // Add modal to body
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // Close modal when clicking outside
    const modal = document.getElementById('element-details-modal');
    modal.onclick = function(event) {
        if (event.target === modal) {
            closeElementDetailsModal();
        }
    };
}

function closeElementDetailsModal() {
    const modal = document.getElementById('element-details-modal');
    if (modal) {
        modal.remove();
    }
}

