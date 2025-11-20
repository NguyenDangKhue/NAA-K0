"""
Models for Reactor and Detector Parameters Management
"""
import json
import os
import numpy as np
import pandas as pd
from typing import Dict, List, Optional
from dataclasses import dataclass, asdict
from datetime import datetime
import re


@dataclass
class ReactorParameter:
    """Thông số lò phản ứng"""
    position: str  # Vị trí chiếu
    f_factor: float  # Hệ số f
    f_uncertainty: float  # Sai số hệ số f
    alpha_factor: float  # Hệ số alpha
    alpha_uncertainty: float  # Sai số hệ số alpha
    note: str  # Ghi chú
    created_at: str = None
    
    def __post_init__(self):
        if self.created_at is None:
            self.created_at = datetime.now().isoformat()


@dataclass
class DetectorParameter:
    """Thông số detector"""
    detector_name: str  # Tên detector
    position: str  # Vị trí chiếu
    efficiency_type: str  # Loại đường hiệu suất: "degree_4" hoặc "degree_5"
    efficiency_coefficients: List[float]  # Các hệ số của đường hiệu suất
    coefficient_uncertainties: List[float]  # Sai số của các hệ số
    note: str  # Ghi chú
    created_at: str = None
    
    def __post_init__(self):
        if self.created_at is None:
            self.created_at = datetime.now().isoformat()
        
        # Validate số lượng hệ số
        if self.efficiency_type == "degree_4" and len(self.efficiency_coefficients) != 5:
            raise ValueError("Đường bậc 4 cần 5 hệ số (a0, a1, a2, a3, a4)")
        elif self.efficiency_type == "degree_5" and len(self.efficiency_coefficients) != 6:
            raise ValueError("Đường bậc 5 cần 6 hệ số (a0, a1, a2, a3, a4, a5)")
    
    def calculate_efficiency(self, energy: float) -> float:
        """Tính hiệu suất tại năng lượng energy (keV)"""
        coeffs = self.efficiency_coefficients
        if self.efficiency_type == "degree_4":
            # E = a0 + a1*ln(E) + a2*ln(E)^2 + a3*ln(E)^3 + a4*ln(E)^4
            ln_e = np.log(energy)
            return coeffs[0] + coeffs[1]*ln_e + coeffs[2]*ln_e**2 + coeffs[3]*ln_e**3 + coeffs[4]*ln_e**4
        else:  # degree_5
            # E = a0 + a1*ln(E) + a2*ln(E)^2 + a3*ln(E)^3 + a4*ln(E)^4 + a5*ln(E)^5
            ln_e = np.log(energy)
            return coeffs[0] + coeffs[1]*ln_e + coeffs[2]*ln_e**2 + coeffs[3]*ln_e**3 + coeffs[4]*ln_e**4 + coeffs[5]*ln_e**5


@dataclass
class NuclearData:
    """Dữ liệu hạt nhân"""
    code: str  # Code
    element: str  # El - Nguyên tố
    emitter: str  # Emitter
    A: float  # A
    E: float  # E (keV) - Năng lượng
    k0: float  # k0
    Q0: float  # Q0
    T_half: float  # T1/2 - Chu kỳ bán rã
    Er: float  # Er


@dataclass
class StandardSampleData:
    """Dữ liệu mẫu chuẩn"""
    sample_name: str  # Tên mẫu chuẩn
    element: str  # Tên nguyên tố
    concentration: Optional[float]  # Hàm lượng
    uncertainty: Optional[float]  # Sai số

@dataclass
class IrradiatedContainer:
    """Container chiếu mẫu"""
    container_name: str  # Tên cont chiếu
    irradiation_position: str  # Vị trí chiếu trong lò
    start_time: str  # Thời gian bắt đầu chiếu (ISO format)
    end_time: str  # Thời gian kết thúc chiếu (ISO format)
    note: Optional[str]  # Ghi chú

@dataclass
class IrradiatedSample:
    """Mẫu đã chiếu trong container"""
    container_name: str  # Tên cont chiếu (foreign key)
    sample_name: str  # Tên mẫu
    spectrum_name: str  # Tên phổ
    position_in_container: str  # Vị trí trong container
    measurement_start_time: str  # Thời gian bắt đầu đo (ISO format)
    measurement_duration: Optional[float]  # Thời gian đo (phút hoặc giây)
    sample_mass: Optional[float]  # Khối lượng mẫu (g)
    is_monitor: bool = False  # Có phải lá dò không
    is_standard_sample: bool = False  # Có phải mẫu chuẩn không
    standard_sample_name: str = ''  # Tên mẫu chuẩn

@dataclass
class PeakAreaData:
    """Dữ liệu diện tích đỉnh"""
    container_name: str  # Tên container
    spectrum_name: str  # Tên phổ
    element_name: str  # Tên nguyên tố (El)
    energy: float  # Năng lượng (keV)
    peak_area: float  # Diện tích đỉnh


class DataManager:
    """Quản lý dữ liệu thông số lò và detector"""
    
    def __init__(self, data_dir: str = "data"):
        self.data_dir = data_dir
        self.reactor_file = os.path.join(data_dir, "reactor_parameters.json")
        self.detector_file = os.path.join(data_dir, "detector_parameters.json")
        self.nuclear_data_file = os.path.join(data_dir, "nuclear_data.json")
        self.standard_sample_file = os.path.join(data_dir, "standard_sample_data.json")
        self.irradiated_containers_file = os.path.join(data_dir, "irradiated_containers.json")
        self.irradiated_samples_file = os.path.join(data_dir, "irradiated_samples.json")
        self.peak_area_data_file = os.path.join(data_dir, "peak_area_data.json")
        
        # Tạo thư mục data nếu chưa có
        os.makedirs(data_dir, exist_ok=True)
        
        # Load dữ liệu
        self.reactor_params = self._load_reactor_params()
        self.detector_params = self._load_detector_params()
        self.nuclear_data = self._load_nuclear_data()
        self.standard_sample_data = self._load_standard_sample_data()
        self.irradiated_containers = self._load_irradiated_containers()
        self.irradiated_samples = self._load_irradiated_samples()
        self.peak_area_data = self._load_peak_area_data()
    
    def _load_reactor_params(self) -> List[Dict]:
        """Load thông số lò từ file"""
        if os.path.exists(self.reactor_file):
            with open(self.reactor_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        return []
    
    def _load_detector_params(self) -> List[Dict]:
        """Load thông số detector từ file"""
        if os.path.exists(self.detector_file):
            with open(self.detector_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        return []
    
    def _save_reactor_params(self):
        """Lưu thông số lò vào file"""
        with open(self.reactor_file, 'w', encoding='utf-8') as f:
            json.dump(self.reactor_params, f, ensure_ascii=False, indent=2)
    
    def _save_detector_params(self):
        """Lưu thông số detector vào file"""
        with open(self.detector_file, 'w', encoding='utf-8') as f:
            json.dump(self.detector_params, f, ensure_ascii=False, indent=2)
    
    def _load_nuclear_data(self) -> List[Dict]:
        """Load dữ liệu hạt nhân từ file"""
        if os.path.exists(self.nuclear_data_file):
            with open(self.nuclear_data_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        return []
    
    def _save_nuclear_data(self):
        """Lưu dữ liệu hạt nhân vào file"""
        with open(self.nuclear_data_file, 'w', encoding='utf-8') as f:
            json.dump(self.nuclear_data, f, ensure_ascii=False, indent=2)
    
    def _load_standard_sample_data(self) -> List[Dict]:
        """Load dữ liệu mẫu chuẩn từ file"""
        if os.path.exists(self.standard_sample_file):
            with open(self.standard_sample_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        return []
    
    def _save_standard_sample_data(self):
        """Lưu dữ liệu mẫu chuẩn vào file"""
        with open(self.standard_sample_file, 'w', encoding='utf-8') as f:
            json.dump(self.standard_sample_data, f, ensure_ascii=False, indent=2)
    
    # Reactor Parameter Methods
    def add_reactor_parameter(self, param: ReactorParameter) -> int:
        """Thêm thông số lò mới, trả về ID"""
        param_dict = asdict(param)
        param_dict['id'] = len(self.reactor_params)
        self.reactor_params.append(param_dict)
        self._save_reactor_params()
        return param_dict['id']
    
    def get_reactor_parameters(self) -> List[Dict]:
        """Lấy tất cả thông số lò"""
        return self.reactor_params
    
    def get_reactor_parameter_by_position(self, position: str) -> List[Dict]:
        """Lấy thông số lò theo vị trí chiếu"""
        return [p for p in self.reactor_params if p['position'] == position]
    
    def get_unique_irradiation_positions(self) -> List[str]:
        """Lấy danh sách các vị trí chiếu duy nhất từ thông số lò"""
        positions = [p.get('position', '').strip() for p in self.reactor_params if p.get('position')]
        unique_positions = sorted(list(set([p for p in positions if p])))
        return unique_positions
    
    def update_reactor_parameter(self, param_id: int, param: ReactorParameter):
        """Cập nhật thông số lò"""
        if 0 <= param_id < len(self.reactor_params):
            param_dict = asdict(param)
            param_dict['id'] = param_id
            self.reactor_params[param_id] = param_dict
            self._save_reactor_params()
            return True
        return False
    
    def delete_reactor_parameter(self, param_id: int):
        """Xóa thông số lò"""
        if 0 <= param_id < len(self.reactor_params):
            del self.reactor_params[param_id]
            # Re-index IDs
            for i, p in enumerate(self.reactor_params):
                p['id'] = i
            self._save_reactor_params()
            return True
        return False
    
    # Detector Parameter Methods
    def add_detector_parameter(self, param: DetectorParameter) -> int:
        """Thêm thông số detector mới, trả về ID"""
        param_dict = asdict(param)
        param_dict['id'] = len(self.detector_params)
        self.detector_params.append(param_dict)
        self._save_detector_params()
        return param_dict['id']
    
    def get_detector_parameters(self) -> List[Dict]:
        """Lấy tất cả thông số detector"""
        return self.detector_params
    
    def get_detector_parameter_by_name_and_position(self, detector_name: str, position: str) -> List[Dict]:
        """Lấy thông số detector theo tên và vị trí"""
        return [p for p in self.detector_params 
                if p['detector_name'] == detector_name and p['position'] == position]
    
    def update_detector_parameter(self, param_id: int, param: DetectorParameter):
        """Cập nhật thông số detector"""
        if 0 <= param_id < len(self.detector_params):
            param_dict = asdict(param)
            param_dict['id'] = param_id
            self.detector_params[param_id] = param_dict
            self._save_detector_params()
            return True
        return False
    
    def delete_detector_parameter(self, param_id: int):
        """Xóa thông số detector"""
        if 0 <= param_id < len(self.detector_params):
            del self.detector_params[param_id]
            # Re-index IDs
            for i, p in enumerate(self.detector_params):
                p['id'] = i
            self._save_detector_params()
            return True
        return False
    
    # Nuclear Data Methods
    def import_nuclear_data_from_csv(self, csv_file_path: str):
        """
        Import dữ liệu hạt nhân từ file CSV
        Xóa toàn bộ dữ liệu cũ và thay thế bằng dữ liệu mới
        Returns: (success, message, count)
        """
        try:
            # Thử nhiều encoding và delimiter để đọc CSV
            encodings = ['utf-8-sig', 'utf-8', 'cp1252', 'latin-1', 'iso-8859-1']
            delimiters = [',', ';', '\t']
            df = None
            error_messages = []
            
            for encoding in encodings:
                for delimiter in delimiters:
                    try:
                        df = pd.read_csv(
                            csv_file_path, 
                            encoding=encoding,
                            delimiter=delimiter,
                            skipinitialspace=True,
                            quotechar='"'
                        )
                        # Kiểm tra xem có đọc được dữ liệu không
                        if df.shape[1] > 1:  # Có ít nhất 2 cột
                            # Strip whitespace từ tên cột
                            df.columns = df.columns.str.strip()
                            break
                    except Exception as e:
                        error_messages.append(f"{encoding}/{delimiter}: {str(e)}")
                        continue
                if df is not None and df.shape[1] > 1:
                    break
            
            if df is None or df.shape[1] <= 1:
                return False, f"Không thể đọc file CSV. Có thể do encoding hoặc delimiter không đúng. Vui lòng kiểm tra file CSV.", 0
            
            # Kiểm tra các cột bắt buộc (case-insensitive và strip whitespace)
            required_columns = ['Code', 'El', 'Emitter', 'A', 'E (keV)', 'k0', 'Q0', 'T1/2', 'Er']
            df_columns_lower = {col.strip().lower(): col for col in df.columns}
            required_lower = {col.lower(): col for col in required_columns}
            
            missing_columns = []
            column_mapping = {}
            
            for req_col in required_columns:
                req_lower = req_col.lower()
                if req_lower in df_columns_lower:
                    column_mapping[req_col] = df_columns_lower[req_lower]
                else:
                    missing_columns.append(req_col)
            
            if missing_columns:
                available_cols = ', '.join(df.columns.tolist())
                return False, f"Thiếu các cột: {', '.join(missing_columns)}. Các cột có trong file: {available_cols}", 0
            
            # Xóa toàn bộ dữ liệu cũ
            self.nuclear_data = []
            
            # Chuyển đổi DataFrame thành list of dicts
            for idx, row in df.iterrows():
                try:
                    # Sử dụng column mapping để lấy giá trị
                    code_col = column_mapping.get('Code', 'Code')
                    el_col = column_mapping.get('El', 'El')
                    emitter_col = column_mapping.get('Emitter', 'Emitter')
                    a_col = column_mapping.get('A', 'A')
                    e_col = column_mapping.get('E (keV)', 'E (keV)')
                    k0_col = column_mapping.get('k0', 'k0')
                    q0_col = column_mapping.get('Q0', 'Q0')
                    t_half_col = column_mapping.get('T1/2', 'T1/2')
                    er_col = column_mapping.get('Er', 'Er')
                    
                    # Xử lý giá trị, loại bỏ whitespace và chuyển đổi kiểu
                    # Cho phép giá trị None (rỗng) cho các trường số
                    def safe_float(value, allow_none=True):
                        if pd.isna(value):
                            return None if allow_none else 0.0
                        if isinstance(value, str):
                            value = value.strip()
                            # Nếu là chuỗi rỗng sau khi strip
                            if value == '':
                                return None if allow_none else 0.0
                            value = value.replace(',', '.')  # Thay dấu phẩy bằng chấm cho số
                        try:
                            return float(value)
                        except (ValueError, TypeError):
                            # Nếu không chuyển đổi được, trả về None nếu cho phép
                            return None if allow_none else 0.0
                    
                    data = {
                        'id': idx,
                        'code': str(row[code_col]).strip() if pd.notna(row[code_col]) else '',
                        'element': str(row[el_col]).strip() if pd.notna(row[el_col]) else '',
                        'emitter': str(row[emitter_col]).strip() if pd.notna(row[emitter_col]) else '',
                        'A': safe_float(row[a_col], allow_none=True),
                        'E': safe_float(row[e_col], allow_none=True),
                        'k0': safe_float(row[k0_col], allow_none=True),
                        'Q0': safe_float(row[q0_col], allow_none=True),
                        'T_half': safe_float(row[t_half_col], allow_none=True),
                        'Er': safe_float(row[er_col], allow_none=True)
                    }
                    self.nuclear_data.append(data)
                except (ValueError, KeyError, TypeError) as e:
                    return False, f"Lỗi ở dòng {idx + 2}: {str(e)}. Vui lòng kiểm tra định dạng dữ liệu.", 0
            
            # Lưu dữ liệu
            self._save_nuclear_data()
            count = len(self.nuclear_data)
            return True, f"Đã import thành công {count} bản ghi", count
            
        except Exception as e:
            return False, f"Lỗi khi đọc file CSV: {str(e)}", 0
    
    def get_nuclear_data(self) -> List[Dict]:
        """Lấy tất cả dữ liệu hạt nhân"""
        return self.nuclear_data
    
    def get_nuclear_data_as_dataframe(self) -> pd.DataFrame:
        """Lấy dữ liệu hạt nhân dưới dạng DataFrame để export CSV"""
        if not self.nuclear_data:
            return pd.DataFrame(columns=['Code', 'El', 'Emitter', 'A', 'E (keV)', 'k0', 'Q0', 'T1/2', 'Er'])
        
        data_list = []
        for item in self.nuclear_data:
            # Xử lý giá trị None - chuyển thành chuỗi rỗng hoặc NaN cho CSV
            data_list.append({
                'Code': item.get('code', ''),
                'El': item.get('element', ''),
                'Emitter': item.get('emitter', ''),
                'A': item.get('A') if item.get('A') is not None else '',
                'E (keV)': item.get('E') if item.get('E') is not None else '',
                'k0': item.get('k0') if item.get('k0') is not None else '',
                'Q0': item.get('Q0') if item.get('Q0') is not None else '',
                'T1/2': item.get('T_half') if item.get('T_half') is not None else '',
                'Er': item.get('Er') if item.get('Er') is not None else ''
            })
        
        return pd.DataFrame(data_list)
    
    def add_nuclear_data(self, data: Dict) -> int:
        """Thêm dữ liệu hạt nhân mới, trả về ID"""
        data['id'] = len(self.nuclear_data)
        self.nuclear_data.append(data)
        self._save_nuclear_data()
        return data['id']
    
    def update_nuclear_data(self, data_id: int, data: Dict) -> bool:
        """Cập nhật dữ liệu hạt nhân"""
        if 0 <= data_id < len(self.nuclear_data):
            data['id'] = data_id
            self.nuclear_data[data_id] = data
            self._save_nuclear_data()
            return True
        return False
    
    def delete_nuclear_data(self, data_id: int) -> bool:
        """Xóa dữ liệu hạt nhân"""
        if 0 <= data_id < len(self.nuclear_data):
            del self.nuclear_data[data_id]
            # Re-index IDs
            for i, item in enumerate(self.nuclear_data):
                item['id'] = i
            self._save_nuclear_data()
            return True
        return False
    
    def create_template_csv(self, template_path: str):
        """Tạo file CSV mẫu với encoding UTF-8-BOM để tương thích với Excel"""
        template_df = pd.DataFrame(columns=['Code', 'El', 'Emitter', 'A', 'E (keV)', 'k0', 'Q0', 'T1/2', 'Er'])
        # Thêm một dòng mẫu
        template_df.loc[0] = ['Example', 'Na', '23Na', 23.0, 1368.6, 0.001, 1.0, 14.96, 0.0]
        # Sử dụng utf-8-sig (UTF-8 với BOM) để Excel có thể đọc đúng
        # Sử dụng delimiter là dấu phẩy (chuẩn CSV)
        template_df.to_csv(template_path, index=False, encoding='utf-8-sig', sep=',', lineterminator='\n')
    
    # Standard Sample Data Methods
    def get_standard_sample_data(self) -> List[Dict]:
        """Lấy tất cả dữ liệu mẫu chuẩn"""
        return self.standard_sample_data
    
    def add_standard_sample_data(self, data: Dict) -> int:
        """Thêm dữ liệu mẫu chuẩn mới, trả về ID"""
        data['id'] = len(self.standard_sample_data)
        self.standard_sample_data.append(data)
        self._save_standard_sample_data()
        return data['id']
    
    def update_standard_sample_data(self, data_id: int, data: Dict) -> bool:
        """Cập nhật dữ liệu mẫu chuẩn"""
        if 0 <= data_id < len(self.standard_sample_data):
            data['id'] = data_id
            self.standard_sample_data[data_id] = data
            self._save_standard_sample_data()
            return True
        return False
    
    def delete_standard_sample_data(self, data_id: int) -> bool:
        """Xóa dữ liệu mẫu chuẩn"""
        if 0 <= data_id < len(self.standard_sample_data):
            del self.standard_sample_data[data_id]
            # Re-index IDs
            for i, item in enumerate(self.standard_sample_data):
                item['id'] = i
            self._save_standard_sample_data()
            return True
        return False
    
    def import_standard_sample_data_from_csv(self, csv_file_path: str):
        """
        Import dữ liệu mẫu chuẩn từ file CSV
        Dữ liệu mới sẽ được thêm vào, KHÔNG xóa dữ liệu cũ
        Returns: (success, message, count)
        """
        try:
            # Thử nhiều encoding và delimiter để đọc CSV
            encodings = ['utf-8-sig', 'utf-8', 'cp1252', 'latin-1', 'iso-8859-1']
            delimiters = [',', ';', '\t']
            df = None
            
            for encoding in encodings:
                for delimiter in delimiters:
                    try:
                        # Đọc file và bỏ qua các dòng comment (bắt đầu bằng #)
                        df = pd.read_csv(
                            csv_file_path, 
                            encoding=encoding,
                            delimiter=delimiter,
                            skipinitialspace=True,
                            quotechar='"',
                            comment='#'  # Bỏ qua các dòng bắt đầu bằng #
                        )
                        if df.shape[1] > 1:
                            df.columns = df.columns.str.strip()
                            break
                    except Exception:
                        continue
                if df is not None and df.shape[1] > 1:
                    break
            
            if df is None or df.shape[1] <= 1:
                return False, "Không thể đọc file CSV. Có thể do encoding hoặc delimiter không đúng.", 0
            
            # Kiểm tra các cột bắt buộc
            required_columns = ['Tên mẫu chuẩn', 'Tên nguyên tố', 'Hàm lượng', 'Sai số']
            df_columns_lower = {col.strip().lower(): col for col in df.columns}
            
            missing_columns = []
            column_mapping = {}
            
            for req_col in required_columns:
                req_lower = req_col.lower()
                if req_lower in df_columns_lower:
                    column_mapping[req_col] = df_columns_lower[req_lower]
                else:
                    missing_columns.append(req_col)
            
            if missing_columns:
                available_cols = ', '.join(df.columns.tolist())
                return False, f"Thiếu các cột: {', '.join(missing_columns)}. Các cột có trong file: {available_cols}", 0
            
            # Thêm dữ liệu mới (KHÔNG xóa dữ liệu cũ)
            added_count = 0
            sample_name_col = column_mapping.get('Tên mẫu chuẩn', 'Tên mẫu chuẩn')
            element_col = column_mapping.get('Tên nguyên tố', 'Tên nguyên tố')
            concentration_col = column_mapping.get('Hàm lượng', 'Hàm lượng')
            uncertainty_col = column_mapping.get('Sai số', 'Sai số')
            
            for idx, row in df.iterrows():
                try:
                    def safe_float(value):
                        if pd.isna(value) or value == '':
                            return None
                        if isinstance(value, str):
                            value = value.strip().replace(',', '.')
                        return float(value)
                    
                    data = {
                        'id': len(self.standard_sample_data) + added_count,
                        'sample_name': str(row[sample_name_col]).strip() if pd.notna(row[sample_name_col]) else '',
                        'element': str(row[element_col]).strip() if pd.notna(row[element_col]) else '',
                        'concentration': safe_float(row[concentration_col]),
                        'uncertainty': safe_float(row[uncertainty_col])
                    }
                    
                    # Kiểm tra dữ liệu hợp lệ
                    if not data['sample_name'] or not data['element']:
                        continue
                    
                    self.standard_sample_data.append(data)
                    added_count += 1
                except (ValueError, KeyError, TypeError) as e:
                    continue  # Bỏ qua dòng lỗi, tiếp tục với dòng tiếp theo
            
            # Lưu dữ liệu
            self._save_standard_sample_data()
            return True, f"Đã import thành công {added_count} bản ghi mới (dữ liệu cũ được giữ nguyên)", added_count
            
        except Exception as e:
            return False, f"Lỗi khi đọc file CSV: {str(e)}", 0
    
    def get_standard_sample_data_as_dataframe(self) -> pd.DataFrame:
        """Lấy dữ liệu mẫu chuẩn dưới dạng DataFrame để export CSV"""
        if not self.standard_sample_data:
            return pd.DataFrame(columns=['Tên mẫu chuẩn', 'Tên nguyên tố', 'Hàm lượng', 'Sai số'])
        
        data_list = []
        for item in self.standard_sample_data:
            data_list.append({
                'Tên mẫu chuẩn': item.get('sample_name', ''),
                'Tên nguyên tố': item.get('element', ''),
                'Hàm lượng': item.get('concentration') if item.get('concentration') is not None else '',
                'Sai số': item.get('uncertainty') if item.get('uncertainty') is not None else ''
            })
        
        return pd.DataFrame(data_list)
    
    def update_sample_name(self, old_name: str, new_name: str) -> tuple[bool, int]:
        """
        Cập nhật tên mẫu chuẩn (đổi tên tất cả nguyên tố của mẫu chuẩn)
        Returns: (success, count)
        """
        count = 0
        for item in self.standard_sample_data:
            if item.get('sample_name') == old_name:
                item['sample_name'] = new_name
                count += 1
        
        if count > 0:
            self._save_standard_sample_data()
            return True, count
        return False, 0
    
    def delete_sample(self, sample_name: str) -> tuple[bool, int]:
        """
        Xóa toàn bộ mẫu chuẩn (xóa tất cả nguyên tố của mẫu chuẩn)
        Returns: (success, count)
        """
        # Lọc ra các item cần giữ lại
        items_to_keep = [item for item in self.standard_sample_data if item.get('sample_name') != sample_name]
        count = len(self.standard_sample_data) - len(items_to_keep)
        
        if count > 0:
            self.standard_sample_data = items_to_keep
            # Re-index IDs
            for i, item in enumerate(self.standard_sample_data):
                item['id'] = i
            self._save_standard_sample_data()
            return True, count
        return False, 0
    
    def create_standard_sample_template_csv(self, template_path: str):
        """Tạo file CSV mẫu cho dữ liệu mẫu chuẩn"""
        template_df = pd.DataFrame(columns=['Tên mẫu chuẩn', 'Tên nguyên tố', 'Hàm lượng', 'Sai số'])
        # Thêm một vài dòng mẫu
        template_df.loc[0] = ['SRM-1633a', 'Na', 0.5, 0.05]
        template_df.loc[1] = ['SRM-1633a', 'K', 1.2, 0.1]
        template_df.to_csv(template_path, index=False, encoding='utf-8-sig', sep=',', lineterminator='\n')
    
    # ========== Irradiated Container and Sample Methods ==========
    
    def _load_irradiated_containers(self) -> List[Dict]:
        """Load dữ liệu container chiếu từ file"""
        if os.path.exists(self.irradiated_containers_file):
            with open(self.irradiated_containers_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        return []
    
    def _save_irradiated_containers(self):
        """Lưu dữ liệu container chiếu vào file"""
        with open(self.irradiated_containers_file, 'w', encoding='utf-8') as f:
            json.dump(self.irradiated_containers, f, ensure_ascii=False, indent=2)
    
    def _load_irradiated_samples(self) -> List[Dict]:
        """Load dữ liệu mẫu đã chiếu từ file"""
        if os.path.exists(self.irradiated_samples_file):
            with open(self.irradiated_samples_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        return []
    
    def _save_irradiated_samples(self):
        """Lưu dữ liệu mẫu đã chiếu vào file"""
        with open(self.irradiated_samples_file, 'w', encoding='utf-8') as f:
            json.dump(self.irradiated_samples, f, ensure_ascii=False, indent=2)
    
    def _load_peak_area_data(self) -> List[Dict]:
        """Load dữ liệu diện tích đỉnh từ file"""
        if os.path.exists(self.peak_area_data_file):
            with open(self.peak_area_data_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        return []
    
    def _save_peak_area_data(self):
        """Lưu dữ liệu diện tích đỉnh vào file"""
        with open(self.peak_area_data_file, 'w', encoding='utf-8') as f:
            json.dump(self.peak_area_data, f, ensure_ascii=False, indent=2)
    
    def get_irradiated_containers(self) -> List[Dict]:
        """Lấy tất cả container chiếu"""
        return self.irradiated_containers
    
    def get_irradiated_samples(self, container_name: str = None) -> List[Dict]:
        """Lấy tất cả mẫu đã chiếu, có thể lọc theo container"""
        if container_name:
            return [s for s in self.irradiated_samples if s.get('container_name') == container_name]
        return self.irradiated_samples
    
    def add_irradiated_container(self, data: Dict) -> int:
        """Thêm container chiếu mới, trả về ID"""
        data['id'] = len(self.irradiated_containers)
        self.irradiated_containers.append(data)
        self._save_irradiated_containers()
        return data['id']
    
    def update_irradiated_container(self, container_id: int, data: Dict) -> bool:
        """Cập nhật container chiếu"""
        if 0 <= container_id < len(self.irradiated_containers):
            data['id'] = container_id
            self.irradiated_containers[container_id] = data
            self._save_irradiated_containers()
            return True
        return False
    
    def delete_irradiated_container(self, container_id: int) -> bool:
        """Xóa container chiếu và tất cả mẫu trong container đó"""
        if 0 <= container_id < len(self.irradiated_containers):
            container_name = self.irradiated_containers[container_id].get('container_name')
            # Xóa container
            del self.irradiated_containers[container_id]
            # Re-index IDs
            for i, item in enumerate(self.irradiated_containers):
                item['id'] = i
            self._save_irradiated_containers()
            
            # Xóa tất cả mẫu trong container
            self.irradiated_samples = [s for s in self.irradiated_samples if s.get('container_name') != container_name]
            for i, item in enumerate(self.irradiated_samples):
                item['id'] = i
            self._save_irradiated_samples()
            return True
        return False
    
    def add_irradiated_sample(self, data: Dict) -> int:
        """Thêm mẫu đã chiếu mới, trả về ID"""
        data['id'] = len(self.irradiated_samples)
        self.irradiated_samples.append(data)
        self._save_irradiated_samples()
        return data['id']
    
    def update_irradiated_sample(self, sample_id: int, data: Dict) -> bool:
        """Cập nhật mẫu đã chiếu"""
        if 0 <= sample_id < len(self.irradiated_samples):
            data['id'] = sample_id
            self.irradiated_samples[sample_id] = data
            self._save_irradiated_samples()
            return True
        return False
    
    def delete_irradiated_sample(self, sample_id: int) -> bool:
        """Xóa mẫu đã chiếu"""
        if 0 <= sample_id < len(self.irradiated_samples):
            del self.irradiated_samples[sample_id]
            # Re-index IDs
            for i, item in enumerate(self.irradiated_samples):
                item['id'] = i
            self._save_irradiated_samples()
            return True
        return False
    
    def import_irradiated_data_from_csv(self, csv_file_path: str):
        """
        Import dữ liệu mẫu đã chiếu từ file CSV
        File CSV có thể chứa cả thông tin container và mẫu
        Returns: (success, message, container_count, sample_count)
        """
        try:
            encodings = ['utf-8-sig', 'utf-8', 'cp1252', 'latin-1', 'iso-8859-1']
            delimiters = [',', ';', '\t']
            df = None
            
            for encoding in encodings:
                for delimiter in delimiters:
                    try:
                        # Đọc file và bỏ qua các dòng comment (bắt đầu bằng #)
                        df = pd.read_csv(
                            csv_file_path, 
                            encoding=encoding,
                            delimiter=delimiter,
                            skipinitialspace=True,
                            quotechar='"',
                            comment='#'  # Bỏ qua các dòng bắt đầu bằng #
                        )
                        if df.shape[1] > 1:
                            df.columns = df.columns.str.strip()
                            break
                    except Exception:
                        continue
                if df is not None and df.shape[1] > 1:
                    break
            
            if df is None or df.shape[1] <= 1:
                return False, "Không thể đọc file CSV. Có thể do encoding hoặc delimiter không đúng.", 0, 0
            
            # Kiểm tra các cột bắt buộc
            required_columns = ['Tên cont chiếu', 'Tên mẫu', 'Tên phổ', 'Vị trí trong container', 
                              'Thời gian bắt đầu đo', 'Thời gian đo', 'Khối lượng mẫu']
            df_columns_lower = {col.strip().lower(): col for col in df.columns}
            
            missing_columns = []
            column_mapping = {}
            
            for req_col in required_columns:
                req_lower = req_col.lower()
                if req_lower in df_columns_lower:
                    column_mapping[req_col] = df_columns_lower[req_lower]
                else:
                    missing_columns.append(req_col)
            
            if missing_columns:
                available_cols = ', '.join(df.columns.tolist())
                return False, f"Thiếu các cột: {', '.join(missing_columns)}. Các cột có trong file: {available_cols}", 0, 0
            
            # Các cột tùy chọn cho container
            container_columns = ['Vị trí chiếu trong lò', 'Thời gian bắt đầu chiếu', 'Thời gian kết thúc chiếu', 'Ghi chú container']
            container_column_mapping = {}
            for col in container_columns:
                col_lower = col.lower()
                if col_lower in df_columns_lower:
                    container_column_mapping[col] = df_columns_lower[col_lower]
            
            # Lấy danh sách vị trí chiếu hợp lệ để validate
            valid_positions = self.get_unique_irradiation_positions()
            
            # Nhóm theo container và tạo containers
            container_names = df[column_mapping['Tên cont chiếu']].unique()
            container_count = 0
            sample_count = 0
            validation_errors = []
            
            for container_name in container_names:
                container_name = str(container_name).strip()
                if not container_name:
                    continue
                
                # Kiểm tra container đã tồn tại chưa
                existing_container = next((c for c in self.irradiated_containers if c.get('container_name') == container_name), None)
                
                if not existing_container:
                    # Lấy thông tin container từ dòng đầu tiên của container này
                    container_rows = df[df[column_mapping['Tên cont chiếu']] == container_name]
                    first_row = container_rows.iloc[0]
                    
                    def normalize_datetime(dt_str):
                        """Chuyển đổi datetime về định dạng dd/mm/yyyy HH:mm:ss"""
                        if not dt_str or pd.isna(dt_str):
                            return ''
                        dt_str = str(dt_str).strip()
                        if not dt_str:
                            return ''
                        
                        # Nếu đã là định dạng dd/mm/yyyy HH:mm:ss, trả về luôn
                        if re.match(r'^\d{2}/\d{2}/\d{4} \d{2}:\d{2}:\d{2}$', dt_str):
                            return dt_str
                        
                        # Thử parse với nhiều định dạng
                        formats = [
                            '%d/%m/%Y %H:%M:%S',
                            '%Y-%m-%d %H:%M:%S',
                            '%d-%m-%Y %H:%M:%S',
                            '%Y/%m/%d %H:%M:%S',
                            '%d/%m/%Y',
                            '%Y-%m-%d'
                        ]
                        
                        for fmt in formats:
                            try:
                                dt = datetime.strptime(dt_str, fmt)
                                return dt.strftime('%d/%m/%Y %H:%M:%S')
                            except ValueError:
                                continue
                        
                        # Nếu không parse được, thử với pd.to_datetime
                        try:
                            dt = pd.to_datetime(dt_str)
                            return dt.strftime('%d/%m/%Y %H:%M:%S')
                        except:
                            return dt_str
                    
                    # Lấy và validate vị trí chiếu
                    irradiation_position = ''
                    if container_column_mapping.get('Vị trí chiếu trong lò') and pd.notna(first_row[container_column_mapping.get('Vị trí chiếu trong lò', 'Vị trí chiếu trong lò')]):
                        irradiation_position = str(first_row[container_column_mapping.get('Vị trí chiếu trong lò', 'Vị trí chiếu trong lò')]).strip()
                        
                        # Validate vị trí chiếu
                        if irradiation_position and valid_positions and irradiation_position not in valid_positions:
                            validation_errors.append(f"Container '{container_name}': Vị trí chiếu '{irradiation_position}' không hợp lệ. Các vị trí hợp lệ: {', '.join(valid_positions)}")
                    
                    container_data = {
                        'id': len(self.irradiated_containers),
                        'container_name': container_name,
                        'irradiation_position': irradiation_position,
                        'start_time': normalize_datetime(first_row[container_column_mapping.get('Thời gian bắt đầu chiếu', 'Thời gian bắt đầu chiếu')]) if container_column_mapping.get('Thời gian bắt đầu chiếu') else '',
                        'end_time': normalize_datetime(first_row[container_column_mapping.get('Thời gian kết thúc chiếu', 'Thời gian kết thúc chiếu')]) if container_column_mapping.get('Thời gian kết thúc chiếu') else '',
                        'note': str(first_row[container_column_mapping.get('Ghi chú container', 'Ghi chú container')]).strip() if container_column_mapping.get('Ghi chú container') and pd.notna(first_row[container_column_mapping.get('Ghi chú container', 'Ghi chú container')]) else ''
                    }
                    self.irradiated_containers.append(container_data)
                    container_count += 1
                
                # Thêm các mẫu
                for idx, row in container_rows.iterrows():
                    def safe_float(value):
                        if pd.isna(value) or value == '':
                            return None
                        if isinstance(value, str):
                            value = value.strip().replace(',', '.')
                        try:
                            return float(value)
                        except (ValueError, TypeError):
                            return None
                    
                    def normalize_datetime(dt_str):
                        """Chuyển đổi datetime về định dạng dd/mm/yyyy HH:mm:ss"""
                        if not dt_str or pd.isna(dt_str):
                            return ''
                        dt_str = str(dt_str).strip()
                        if not dt_str:
                            return ''
                        
                        # Nếu đã là định dạng dd/mm/yyyy HH:mm:ss, trả về luôn
                        if re.match(r'^\d{2}/\d{2}/\d{4} \d{2}:\d{2}:\d{2}$', dt_str):
                            return dt_str
                        
                        # Thử parse với nhiều định dạng
                        formats = [
                            '%d/%m/%Y %H:%M:%S',
                            '%Y-%m-%d %H:%M:%S',
                            '%d-%m-%Y %H:%M:%S',
                            '%Y/%m/%d %H:%M:%S',
                            '%d/%m/%Y',
                            '%Y-%m-%d'
                        ]
                        
                        for fmt in formats:
                            try:
                                dt = datetime.strptime(dt_str, fmt)
                                return dt.strftime('%d/%m/%Y %H:%M:%S')
                            except ValueError:
                                continue
                        
                        # Nếu không parse được, thử với pd.to_datetime
                        try:
                            dt = pd.to_datetime(dt_str)
                            return dt.strftime('%d/%m/%Y %H:%M:%S')
                        except:
                            return dt_str
                    
                    sample_data = {
                        'id': len(self.irradiated_samples),
                        'container_name': container_name,
                        'sample_name': str(row[column_mapping['Tên mẫu']]).strip() if pd.notna(row[column_mapping['Tên mẫu']]) else '',
                        'spectrum_name': str(row[column_mapping['Tên phổ']]).strip() if pd.notna(row[column_mapping['Tên phổ']]) else '',
                        'position_in_container': str(row[column_mapping['Vị trí trong container']]).strip() if pd.notna(row[column_mapping['Vị trí trong container']]) else '',
                        'measurement_start_time': normalize_datetime(row[column_mapping['Thời gian bắt đầu đo']]) if pd.notna(row[column_mapping['Thời gian bắt đầu đo']]) else '',
                        'measurement_duration': safe_float(row[column_mapping['Thời gian đo']]),
                        'sample_mass': safe_float(row[column_mapping['Khối lượng mẫu']])
                    }
                    
                    if sample_data['sample_name']:
                        self.irradiated_samples.append(sample_data)
                        sample_count += 1
            
            # Kiểm tra lỗi validation
            if validation_errors:
                error_message = "Lỗi validation:\n" + "\n".join(validation_errors)
                return False, error_message, 0, 0
            
            self._save_irradiated_containers()
            self._save_irradiated_samples()
            return True, f"Đã import thành công {container_count} container và {sample_count} mẫu", container_count, sample_count
            
        except Exception as e:
            return False, f"Lỗi khi đọc file CSV: {str(e)}", 0, 0
    
    def extract_spe_file_info(self, spe_file_path: str):
        """
        Trích xuất thông tin từ file .Spe
        Returns: (spectrum_name, real_time, measurement_date) hoặc None nếu lỗi
        """
        try:
            real_time = None
            measurement_date = None
            
            with open(spe_file_path, 'r', encoding='utf-8', errors='ignore') as file:
                lines = file.readlines()
                for i, line in enumerate(lines):
                    if line.startswith("$MEAS_TIM:") and i + 1 < len(lines):
                        values = lines[i + 1].strip().split()
                        if values:
                            try:
                                real_time = int(values[0])  # Lấy giá trị real time (giây)
                            except (ValueError, IndexError):
                                pass
                    
                    if line.startswith("$DATE_MEA:") and i + 1 < len(lines):
                        measurement_date_raw = lines[i + 1].strip().replace(",", "")  # Định dạng ngày tháng từ file .Spe
                        
                        # Chuyển đổi từ MM/DD/YYYY HH:MM:SS sang DD/MM/YYYY HH:MM:SS
                        # File .Spe thường có định dạng: MM/DD/YYYY HH:MM:SS (tháng/ngày/năm)
                        # Hệ thống cần: DD/MM/YYYY HH:MM:SS (ngày/tháng/năm)
                        try:
                            # Tách phần ngày tháng và phần giờ
                            parts = measurement_date_raw.split()
                            if len(parts) >= 2:
                                date_part = parts[0]  # MM/DD/YYYY
                                time_part = ' '.join(parts[1:])  # HH:MM:SS (có thể có thêm phần khác)
                                
                                # Parse ngày tháng từ MM/DD/YYYY
                                date_components = date_part.split('/')
                                if len(date_components) == 3:
                                    month = date_components[0]
                                    day = date_components[1]
                                    year = date_components[2]
                                    
                                    # Chuyển đổi sang DD/MM/YYYY
                                    measurement_date = f"{day}/{month}/{year} {time_part}"
                                else:
                                    measurement_date = measurement_date_raw
                            else:
                                # Nếu không có phần giờ, chỉ chuyển đổi ngày tháng
                                date_components = measurement_date_raw.split('/')
                                if len(date_components) == 3:
                                    month = date_components[0]
                                    day = date_components[1]
                                    year = date_components[2]
                                    measurement_date = f"{day}/{month}/{year}"
                                else:
                                    measurement_date = measurement_date_raw
                        except Exception as e:
                            # Nếu có lỗi trong quá trình chuyển đổi, giữ nguyên giá trị gốc
                            print(f"Warning: Could not convert date format for {measurement_date_raw}: {str(e)}")
                            measurement_date = measurement_date_raw
            
            # Lấy tên phổ từ tên file (bỏ đuôi .spe)
            spectrum_name = os.path.splitext(os.path.basename(spe_file_path))[0]
            
            if real_time is not None and measurement_date is not None:
                return {
                    'spectrum_name': spectrum_name,
                    'real_time': real_time,
                    'measurement_date': measurement_date
                }
            return None
        except Exception as e:
            print(f"Error reading .Spe file {spe_file_path}: {str(e)}")
            return None
    
    def process_spe_files_to_csv(self, spe_file_paths: List[str], output_csv_path: str):
        """
        Xử lý nhiều file .Spe và tạo file CSV với dữ liệu đã điền sẵn
        Args:
            spe_file_paths: Danh sách đường dẫn file .Spe
            output_csv_path: Đường dẫn file CSV đầu ra
        Returns: (success, message, data_count)
        """
        try:
            data = []
            
            for spe_file_path in spe_file_paths:
                info = self.extract_spe_file_info(spe_file_path)
                if info:
                    # Chuyển đổi measurement_date sang định dạng dd/mm/yyyy HH:mm:ss
                    # Format từ file .Spe thường là: "01/01/2024 10:00:00" hoặc tương tự
                    measurement_date = info['measurement_date']
                    real_time = info['real_time']
                    spectrum_name = info['spectrum_name']
                    
                    data.append({
                        'Tên phổ': spectrum_name,
                        'Thời gian bắt đầu đo': measurement_date,
                        'Thời gian đo': real_time
                    })
            
            if not data:
                return False, "Không tìm thấy dữ liệu hợp lệ trong các file .Spe", 0
            
            # Lấy template CSV để biết cấu trúc đầy đủ
            temp_template_path = os.path.join(os.path.dirname(output_csv_path), 'temp_template.csv')
            self.create_irradiated_data_template_csv(temp_template_path)
            
            # Đọc template để lấy cấu trúc (bỏ qua các dòng comment)
            template_df = pd.read_csv(temp_template_path, encoding='utf-8-sig', comment='#')
            
            # Tạo DataFrame mới với đầy đủ các cột từ template
            result_df = pd.DataFrame(columns=template_df.columns)
            
            # Điền dữ liệu từ file .Spe vào các cột tương ứng
            for item in data:
                new_row = {col: '' for col in template_df.columns}
                new_row['Tên phổ'] = item['Tên phổ']
                new_row['Thời gian bắt đầu đo'] = item['Thời gian bắt đầu đo']
                new_row['Thời gian đo'] = item['Thời gian đo']
                result_df = pd.concat([result_df, pd.DataFrame([new_row])], ignore_index=True)
            
            # Ghi file CSV với encoding UTF-8-sig để Excel đọc được tiếng Việt
            with open(output_csv_path, 'w', encoding='utf-8-sig', newline='') as f:
                # Ghi lại các dòng comment từ template
                with open(temp_template_path, 'r', encoding='utf-8-sig') as template_file:
                    for line in template_file:
                        if line.strip().startswith('#'):
                            f.write(line)
                
                # Ghi header và data
                result_df.to_csv(f, index=False, lineterminator='\n')
            
            # Xóa file template tạm
            if os.path.exists(temp_template_path):
                os.remove(temp_template_path)
            
            return True, f"Đã xử lý {len(data)} file .Spe thành công", len(data)
            
        except Exception as e:
            import traceback
            traceback.print_exc()
            return False, f"Lỗi khi xử lý file .Spe: {str(e)}", 0
    
    def create_irradiated_data_template_csv(self, template_path: str):
        """Tạo file CSV mẫu cho dữ liệu mẫu đã chiếu"""
        # Lấy danh sách vị trí chiếu hợp lệ
        valid_positions = self.get_unique_irradiation_positions()
        positions_text = ', '.join(valid_positions) if valid_positions else '(Chưa có vị trí chiếu nào được khai báo)'
        
        # Tạo file với dòng hướng dẫn
        with open(template_path, 'w', encoding='utf-8-sig', newline='') as f:
            # Ghi dòng hướng dẫn về vị trí chiếu
            f.write(f"# LƯU Ý: Cột 'Vị trí chiếu trong lò' chỉ chấp nhận các giá trị sau: {positions_text}\n")
            f.write(f"# Vui lòng chọn một trong các giá trị trên. Nếu giá trị không khớp, dữ liệu sẽ bị từ chối khi import.\n")
            f.write("#\n")
            
            # Tạo DataFrame cho dữ liệu mẫu
            template_df = pd.DataFrame(columns=[
                'Tên cont chiếu', 'Vị trí chiếu trong lò', 'Thời gian bắt đầu chiếu', 
                'Thời gian kết thúc chiếu', 'Ghi chú container',
                'Tên mẫu', 'Tên phổ', 'Vị trí trong container', 
                'Thời gian bắt đầu đo', 'Thời gian đo', 'Khối lượng mẫu'
            ])
            # Thêm dòng mẫu - định dạng: dd/mm/yyyy HH:mm:ss
            if valid_positions:
                sample_position = valid_positions[0]
            else:
                sample_position = 'Vị trí 1'  # Giá trị mẫu nếu chưa có vị trí nào
            
            template_df.loc[0] = [
                'CONT-001', sample_position, '01/01/2024 10:00:00', '01/01/2024 12:00:00', 'Lần chiếu đầu tiên',
                'Mẫu-001', 'Phổ-001', 'A1', '01/01/2024 13:00:00', 3600, 0.5
            ]
            template_df.loc[1] = [
                'CONT-001', sample_position, '01/01/2024 10:00:00', '01/01/2024 12:00:00', 'Lần chiếu đầu tiên',
                'Mẫu-002', 'Phổ-002', 'A2', '01/01/2024 13:30:00', 3600, 0.5
            ]
            
            # Ghi DataFrame vào file
            template_df.to_csv(f, index=False, sep=',', lineterminator='\n')
    
    # ========== Peak Area Data Methods ==========
    
    def get_peak_area_data(self, container_name: str = None, spectrum_name: str = None) -> List[Dict]:
        """Lấy tất cả dữ liệu diện tích đỉnh, có thể lọc theo container hoặc spectrum"""
        data = self.peak_area_data
        if container_name:
            data = [d for d in data if d.get('container_name') == container_name]
        if spectrum_name:
            data = [d for d in data if d.get('spectrum_name') == spectrum_name]
        return data
    
    def add_peak_area_data(self, data: Dict) -> int:
        """Thêm dữ liệu diện tích đỉnh mới, trả về ID"""
        data['id'] = len(self.peak_area_data)
        self.peak_area_data.append(data)
        self._save_peak_area_data()
        return data['id']
    
    def update_peak_area_data(self, data_id: int, data: Dict) -> bool:
        """Cập nhật dữ liệu diện tích đỉnh"""
        if 0 <= data_id < len(self.peak_area_data):
            data['id'] = data_id
            self.peak_area_data[data_id] = data
            self._save_peak_area_data()
            return True
        return False
    
    def delete_peak_area_data(self, data_id: int) -> bool:
        """Xóa dữ liệu diện tích đỉnh"""
        if 0 <= data_id < len(self.peak_area_data):
            del self.peak_area_data[data_id]
            for i, item in enumerate(self.peak_area_data):
                item['id'] = i
            self._save_peak_area_data()
            return True
        return False
    
    def get_unique_elements(self) -> List[str]:
        """Lấy danh sách các nguyên tố duy nhất từ dữ liệu hạt nhân"""
        # Dữ liệu được lưu với key 'element' (chữ thường)
        elements = [item.get('element', '').strip() for item in self.nuclear_data if item.get('element')]
        # Loại bỏ trùng lặp và giá trị rỗng
        unique_elements = sorted(list(set([e for e in elements if e])))
        return unique_elements
    
    def get_energies_by_element(self, element: str) -> List[float]:
        """Lấy danh sách năng lượng theo nguyên tố"""
        energies = []
        for item in self.nuclear_data:
            # Dữ liệu được lưu với key 'element' và 'E' (không phải 'E (keV)')
            if item.get('element', '').strip() == element and item.get('E') is not None:
                try:
                    energy = float(item.get('E'))
                    if energy not in energies:
                        energies.append(energy)
                except (ValueError, TypeError):
                    continue
        return sorted(energies)
    
    def get_spectrum_names_by_container(self, container_name: str) -> List[str]:
        """Lấy danh sách tên phổ theo container"""
        spectrum_names = []
        for sample in self.irradiated_samples:
            if sample.get('container_name') == container_name:
                spectrum_name = sample.get('spectrum_name', '').strip()
                if spectrum_name and spectrum_name not in spectrum_names:
                    spectrum_names.append(spectrum_name)
        return sorted(spectrum_names)
    
    def get_monitor_spectra_for_calculation(self, container_name: str) -> List[Dict]:
        """
        Lấy danh sách các phổ là lá dò trong container với đầy đủ thông tin để tính toán
        Returns: List of dicts với các thông tin cần thiết
        """
        from datetime import datetime
        import re
        
        # Lấy container info
        container = next((c for c in self.irradiated_containers if c.get('container_name') == container_name), None)
        if not container:
            return []
        
        # Lấy các phổ là lá dò (is_monitor = True) từ irradiated_samples
        monitor_samples = [
            s for s in self.irradiated_samples
            if s.get('container_name') == container_name and 
               s.get('is_monitor', False)
        ]
        
        # Lấy thông tin sample cho mỗi phổ
        result = []
        for sample in monitor_samples:
            spectrum_name = sample.get('spectrum_name', '').strip()
            if not spectrum_name:
                continue
            
            # Extract vị trí đo từ tên phổ (phần sau dấu "-")
            measurement_position = ''
            if '-' in spectrum_name:
                parts = spectrum_name.split('-')
                if len(parts) > 1:
                    # Lấy phần sau dấu "-" và extract số
                    after_dash = parts[-1]
                    # Tìm số trong phần sau dấu "-"
                    match = re.search(r'\d+', after_dash)
                    if match:
                        measurement_position = match.group()
            
            # Parse datetime strings
            def parse_datetime(dt_str):
                """Parse datetime từ định dạng dd/mm/yyyy HH:mm:ss"""
                if not dt_str:
                    return None
                try:
                    # Thử parse với định dạng dd/mm/yyyy HH:mm:ss
                    if re.match(r'^\d{2}/\d{2}/\d{4} \d{2}:\d{2}:\d{2}$', dt_str.strip()):
                        return datetime.strptime(dt_str.strip(), '%d/%m/%Y %H:%M:%S')
                    # Thử với các định dạng khác
                    formats = [
                        '%Y-%m-%d %H:%M:%S',
                        '%d-%m-%Y %H:%M:%S',
                        '%Y/%m/%d %H:%M:%S'
                    ]
                    for fmt in formats:
                        try:
                            return datetime.strptime(dt_str.strip(), fmt)
                        except ValueError:
                            continue
                    # Thử với pd.to_datetime nếu có
                    try:
                        return pd.to_datetime(dt_str)
                    except:
                        pass
                except:
                    pass
                return None
            
            start_time = parse_datetime(container.get('start_time', ''))
            end_time = parse_datetime(container.get('end_time', ''))
            measurement_start_time = parse_datetime(sample.get('measurement_start_time', ''))
            
            # Tính tổng thời gian chiếu (giây)
            total_irradiation_time = None
            if start_time and end_time:
                delta = end_time - start_time
                total_irradiation_time = delta.total_seconds()
            
            # Tính thời gian rã (giây)
            decay_time = None
            if end_time and measurement_start_time:
                delta = measurement_start_time - end_time
                decay_time = delta.total_seconds()
            
            # Lấy T1/2 của Au
            au_t_half = None
            for nuclear_item in self.nuclear_data:
                if nuclear_item.get('element', '').strip().upper() == 'AU':
                    t_half = nuclear_item.get('T_half')
                    if t_half is not None:
                        au_t_half = float(t_half)
                        break
            
            # Tính ℰp,(a) dựa trên vị trí đo và detector parameters
            epsilon_p_a = None
            if measurement_position:
                # Tìm detector parameter có position khớp với measurement_position
                detector_param = None
                for dp in self.detector_params:
                    dp_position = str(dp.get('position', '')).strip()
                    mp_position = str(measurement_position).strip()
                    if dp_position == mp_position:
                        detector_param = dp
                        break
                
                if detector_param:
                    try:
                        efficiency_type = detector_param.get('efficiency_type', '')
                        efficiency_coefficients = detector_param.get('efficiency_coefficients', [])
                        
                        if efficiency_type and efficiency_coefficients:
                            # Năng lượng cố định: 411.8 keV
                            E = 411.8
                            log_E = np.log10(E)  # LOG (logarit thập phân)
                            
                            if efficiency_type == 'degree_4' and len(efficiency_coefficients) == 5:
                                # Bậc 4: ℰp,(a) = 10^(a4*LOG(411.8)^4 + a3*LOG(411.8)^3 + a2*LOG(411.8)^2 + a1*LOG(411.8) + a0)
                                a0, a1, a2, a3, a4 = efficiency_coefficients
                                exponent = a4 * (log_E ** 4) + a3 * (log_E ** 3) + a2 * (log_E ** 2) + a1 * log_E + a0
                                epsilon_p_a = 10 ** exponent
                            elif efficiency_type == 'degree_5' and len(efficiency_coefficients) == 6:
                                # Bậc 5: ℰp,(a) = 10^(a5*LOG(411.8)^5 + a4*LOG(411.8)^4 + a3*LOG(411.8)^3 + a2*LOG(411.8)^2 + a1*LOG(411.8) + a0)
                                a0, a1, a2, a3, a4, a5 = efficiency_coefficients
                                exponent = a5 * (log_E ** 5) + a4 * (log_E ** 4) + a3 * (log_E ** 3) + a2 * (log_E ** 2) + a1 * log_E + a0
                                epsilon_p_a = 10 ** exponent
                    except (ValueError, TypeError, IndexError) as e:
                        # Nếu có lỗi trong tính toán, để epsilon_p_a = None
                        import traceback
                        print(f"Error calculating epsilon_p_a for spectrum {spectrum_name}: {e}")
                        traceback.print_exc()
                        epsilon_p_a = None
            
            # Lấy diện tích đỉnh từ peak area data
            # Ưu tiên lấy diện tích đỉnh của Au (vì đây là lá dò)
            peak_area_value = None
            peak_area_data_for_spectrum = [
                pa for pa in self.peak_area_data 
                if pa.get('container_name') == container_name and 
                   pa.get('spectrum_name', '').strip() == spectrum_name
            ]
            
            if peak_area_data_for_spectrum:
                # Tìm diện tích đỉnh của Au với năng lượng 411.8 keV
                au_peak = next((
                    pa for pa in peak_area_data_for_spectrum 
                    if pa.get('element_name', '').strip().upper() == 'AU' and 
                       abs(float(pa.get('energy', 0)) - 411.8) < 0.1
                ), None)
                
                if au_peak:
                    peak_area_value = au_peak.get('peak_area')
                else:
                    # Nếu không tìm thấy Au, lấy diện tích đỉnh đầu tiên
                    peak_area_value = peak_area_data_for_spectrum[0].get('peak_area')
            
            result.append({
                'spectrum_name': spectrum_name,
                'measurement_position': measurement_position,
                'position_in_container': sample.get('position_in_container', '') or '',
                'start_time': container.get('start_time', '') or '',
                'end_time': container.get('end_time', '') or '',
                'total_irradiation_time': total_irradiation_time,
                'measurement_start_time': sample.get('measurement_start_time', '') or '',
                'measurement_duration': sample.get('measurement_duration'),
                'sample_mass': sample.get('sample_mass'),
                'decay_time': decay_time,
                'au_t_half': au_t_half,
                'epsilon_p_a': epsilon_p_a,
                'peak_area': peak_area_value
            })
        
        return sorted(result, key=lambda x: x.get('spectrum_name', ''))
    
    def get_non_monitor_spectra_for_calculation(self, container_name: str) -> List[Dict]:
        """
        Lấy danh sách các phổ không phải lá dò trong container với đầy đủ thông tin để tính toán
        Returns: List of dicts với các thông tin cần thiết, mỗi dict chứa thông tin phổ và danh sách các nguyên tố
        """
        from datetime import datetime
        import re
        import numpy as np
        
        # Lấy container info
        container = next((c for c in self.irradiated_containers if c.get('container_name') == container_name), None)
        if not container:
            return []
        
        def parse_datetime(dt_str):
            """Parse datetime strings from multiple formats to datetime objects."""
            if not dt_str:
                return None
            try:
                if re.match(r'^\d{2}/\d{2}/\d{4} \d{2}:\d{2}:\d{2}$', str(dt_str).strip()):
                    return datetime.strptime(str(dt_str).strip(), '%d/%m/%Y %H:%M:%S')
                formats = [
                    '%Y-%m-%d %H:%M:%S',
                    '%d-%m-%Y %H:%M:%S',
                    '%Y/%m/%d %H:%M:%S',
                    '%Y-%m-%dT%H:%M:%S'
                ]
                for fmt in formats:
                    try:
                        return datetime.strptime(str(dt_str).strip(), fmt)
                    except ValueError:
                        continue
                try:
                    import pandas as pd
                    return pd.to_datetime(dt_str)
                except Exception:
                    return None
            except Exception:
                return None
        
        def get_nuclear_info(element_name: str, energy: float):
            """Get nuclear dataset row for element/energy with tolerance."""
            if element_name is None or energy is None:
                return None
            element_upper = str(element_name).strip().upper()
            try:
                energy_value = float(energy)
            except (TypeError, ValueError):
                return None
            for nuc in self.nuclear_data:
                nuc_element = str(
                    nuc.get('element') or nuc.get('El') or ''
                ).strip().upper()
                if nuc_element != element_upper:
                    continue
                nuc_energy = nuc.get('E') or nuc.get('energy')
                if nuc_energy is None:
                    continue
                try:
                    if abs(float(nuc_energy) - energy_value) < 0.1:
                        return nuc
                except (TypeError, ValueError):
                    continue
            return None
        
        container_start_time = parse_datetime(container.get('start_time', ''))
        container_end_time = parse_datetime(container.get('end_time', ''))
        container_total_irradiation_time = None
        if container_start_time and container_end_time:
            container_total_irradiation_time = (container_end_time - container_start_time).total_seconds()
        
        # Lấy T1/2 của Au (dùng làm giá trị dự phòng)
        au_t_half_default = None
        for nuclear_item in self.nuclear_data:
            if str(nuclear_item.get('element', '')).strip().upper() == 'AU':
                t_half = nuclear_item.get('T_half')
                if t_half is not None:
                    try:
                        au_t_half_default = float(t_half)
                        break
                    except (TypeError, ValueError):
                        continue
        
        standard_concentration_map = {}
        for record in self.standard_sample_data:
            sample_key = str(record.get('sample_name', '')).strip().upper()
            element_key = str(record.get('element', '')).strip().upper()
            if not sample_key or not element_key:
                continue
            standard_concentration_map[(sample_key, element_key)] = record.get('concentration')
        
        # Lấy các phổ không phải lá dò (is_monitor = False) từ irradiated_samples
        non_monitor_samples = [
            s for s in self.irradiated_samples
            if s.get('container_name') == container_name and 
               not s.get('is_monitor', False)
        ]
        
        # Tạo dict với spectrum_name làm key
        non_monitor_spectra = {}
        for sample in non_monitor_samples:
            spectrum_name = sample.get('spectrum_name', '').strip()
            if spectrum_name and spectrum_name not in non_monitor_spectra:
                non_monitor_spectra[spectrum_name] = []
        
        # Lấy danh sách mẫu chuẩn trong cùng container
        standard_samples_in_container = [
            s for s in self.irradiated_samples
            if s.get('container_name') == container_name and s.get('is_standard_sample', False)
        ]
        
        standard_samples_info = []
        for std_sample in standard_samples_in_container:
            std_spectrum = std_sample.get('spectrum_name', '').strip()
            measurement_start_dt = parse_datetime(std_sample.get('measurement_start_time', ''))
            decay_time = None
            if container_end_time and measurement_start_dt:
                decay_time = (measurement_start_dt - container_end_time).total_seconds()
            measurement_duration = std_sample.get('measurement_duration')
            try:
                measurement_duration = float(measurement_duration) if measurement_duration is not None else None
            except (TypeError, ValueError):
                measurement_duration = None
            sample_mass = std_sample.get('sample_mass')
            try:
                sample_mass = float(sample_mass) if sample_mass is not None else None
            except (TypeError, ValueError):
                sample_mass = None
            
            # Peak data của mẫu chuẩn
            std_peak_area_entries = [
                pa for pa in self.peak_area_data
                if pa.get('container_name') == container_name and pa.get('spectrum_name', '').strip() == std_spectrum
            ]
            
            peaks_info = []
            for peak_area in std_peak_area_entries:
                element_name = peak_area.get('element_name', '').strip()
                energy = peak_area.get('energy')
                nuclear_info = get_nuclear_info(element_name, energy)
                
                t_half_value = None
                if nuclear_info:
                    t_half_value = nuclear_info.get('T_half') or nuclear_info.get('t_half')
                if t_half_value is None:
                    t_half_value = au_t_half_default
                
                sM = dM = cM = None
                if t_half_value and t_half_value > 0:
                    try:
                        ln2_over_tHalf = np.log(2) / float(t_half_value)
                        if container_total_irradiation_time is not None:
                            sM = 1 - np.exp(-ln2_over_tHalf * container_total_irradiation_time)
                        if decay_time is not None:
                            dM = np.exp(-ln2_over_tHalf * decay_time)
                        if measurement_duration and measurement_duration > 0:
                            denominator = ln2_over_tHalf * measurement_duration
                            if denominator != 0:
                                cM = (1 - np.exp(-ln2_over_tHalf * measurement_duration)) / denominator
                    except (TypeError, ValueError, ZeroDivisionError):
                        sM = dM = cM = None
                
                std_identifier = str(std_sample.get('standard_sample_name') or std_sample.get('sample_name') or '').strip().upper()
                concentration_value = None
                if std_identifier and element_name:
                    concentration_value = standard_concentration_map.get((std_identifier, element_name.strip().upper()))
                
                peaks_info.append({
                    'element_name': element_name,
                    'energy': energy,
                    'peak_area': peak_area.get('peak_area'),
                    's_m': float(sM) if sM is not None else None,
                    'd_m': float(dM) if dM is not None else None,
                    'c_m': float(cM) if cM is not None else None,
                    'concentration': concentration_value
                })
            
            std_measurement_position = std_sample.get('measurement_position', '')
            if not std_measurement_position and std_spectrum:
                if '-' in std_spectrum:
                    parts = std_spectrum.split('-')
                    if len(parts) > 1:
                        after_dash = parts[-1]
                        match = re.search(r'\d+', after_dash)
                        if match:
                            std_measurement_position = match.group()
            
            standard_samples_info.append({
                'sample_name': std_sample.get('sample_name', ''),
                'standard_sample_name': std_sample.get('standard_sample_name', ''),
                'spectrum_name': std_spectrum,
                'measurement_duration': measurement_duration,
                'measurement_start_time': std_sample.get('measurement_start_time', '') or '',
                'sample_mass': sample_mass,
                'position_in_container': std_sample.get('position_in_container', '') or '',
                'measurement_position': std_measurement_position or '',
                'peaks': peaks_info
            })
        
        # Lấy tất cả peak area data cho mỗi phổ, group theo nguyên tố
        for peak_area in self.peak_area_data:
            if peak_area.get('container_name') == container_name:
                spectrum_name = peak_area.get('spectrum_name', '').strip()
                if spectrum_name in non_monitor_spectra:
                    element_name = peak_area.get('element_name', '').strip()
                    energy = peak_area.get('energy')
                    peak_area_value = peak_area.get('peak_area')
                    
                    # Tìm hoặc tạo entry cho nguyên tố này
                    element_entry = next(
                        (e for e in non_monitor_spectra[spectrum_name] if e.get('element_name') == element_name),
                        None
                    )
                    if not element_entry:
                        element_entry = {
                            'element_name': element_name,
                            'peaks': []
                        }
                        non_monitor_spectra[spectrum_name].append(element_entry)
                    
                    # Thêm peak data
                    element_entry['peaks'].append({
                        'energy': energy,
                        'peak_area': peak_area_value
                    })
        
        # Lấy thông tin sample và tính toán cho mỗi phổ
        result = []
        for spectrum_name, elements in non_monitor_spectra.items():
            # Tìm sample tương ứng
            sample = next((s for s in self.irradiated_samples 
                         if s.get('container_name') == container_name and 
                         s.get('spectrum_name', '').strip() == spectrum_name), None)
            
            if not sample:
                continue
            
            # Extract vị trí đo từ tên phổ
            measurement_position = ''
            if '-' in spectrum_name:
                parts = spectrum_name.split('-')
                if len(parts) > 1:
                    after_dash = parts[-1]
                    match = re.search(r'\d+', after_dash)
                    if match:
                        measurement_position = match.group()
            
            start_time = parse_datetime(container.get('start_time', ''))
            end_time = parse_datetime(container.get('end_time', ''))
            measurement_start_time = parse_datetime(sample.get('measurement_start_time', ''))
            
            # Tính tổng thời gian chiếu (giây)
            total_irradiation_time = None
            if start_time and end_time:
                delta = end_time - start_time
                total_irradiation_time = delta.total_seconds()
            
            # Tính thời gian rã (giây)
            decay_time = None
            if end_time and measurement_start_time:
                delta = measurement_start_time - end_time
                decay_time = delta.total_seconds()
            
            # Tính ℰp,(a) dựa trên vị trí đo và detector parameters
            epsilon_p_a = None
            if measurement_position:
                detector_param = None
                for dp in self.detector_params:
                    dp_position = str(dp.get('position', '')).strip()
                    mp_position = str(measurement_position).strip()
                    if dp_position == mp_position:
                        detector_param = dp
                        break
                
                if detector_param:
                    try:
                        efficiency_type = detector_param.get('efficiency_type', '')
                        efficiency_coefficients = detector_param.get('efficiency_coefficients', [])
                        
                        if efficiency_type and efficiency_coefficients:
                            # Sẽ tính cho từng năng lượng sau
                            pass
                    except Exception as e:
                        import traceback
                        print(f"Error getting detector param: {e}")
                        traceback.print_exc()
            
            # Xử lý từng nguyên tố và các peak của nó
            processed_elements = []
            for element_entry in elements:
                element_name = element_entry['element_name']
                peaks = element_entry['peaks']
                
                for peak in peaks:
                    energy = peak.get('energy')
                    peak_area_value = peak.get('peak_area')
                    
                    # Lấy thông tin từ nuclear data
                    nuclear_info = None
                    for nuc in self.nuclear_data:
                        if (nuc.get('element', '').strip().upper() == element_name.upper() and
                            abs(float(nuc.get('E', 0)) - float(energy)) < 0.1):
                            nuclear_info = nuc
                            break
                    
                    # Tính ℰp,(a) cho năng lượng này
                    epsilon_p_a_value = None
                    if measurement_position and detector_param:
                        try:
                            efficiency_type = detector_param.get('efficiency_type', '')
                            efficiency_coefficients = detector_param.get('efficiency_coefficients', [])
                            
                            if efficiency_type and efficiency_coefficients and energy:
                                E = float(energy)
                                log_E = np.log10(E)
                                
                                if efficiency_type == 'degree_4' and len(efficiency_coefficients) == 5:
                                    a0, a1, a2, a3, a4 = efficiency_coefficients
                                    exponent = a4 * (log_E ** 4) + a3 * (log_E ** 3) + a2 * (log_E ** 2) + a1 * log_E + a0
                                    epsilon_p_a_value = 10 ** exponent
                                elif efficiency_type == 'degree_5' and len(efficiency_coefficients) == 6:
                                    a0, a1, a2, a3, a4, a5 = efficiency_coefficients
                                    exponent = a5 * (log_E ** 5) + a4 * (log_E ** 4) + a3 * (log_E ** 3) + a2 * (log_E ** 2) + a1 * log_E + a0
                                    epsilon_p_a_value = 10 ** exponent
                        except Exception as e:
                            import traceback
                            print(f"Error calculating epsilon_p_a for energy {energy}: {e}")
                            traceback.print_exc()
                    
                    # Tính S(m), D(m), C(m) - dùng T1/2 của nguyên tố này, nếu không có thì dùng Au
                    t_half = None
                    if nuclear_info:
                        t_half = nuclear_info.get('T_half')
                    
                    if t_half is None:
                        t_half = au_t_half_default
                    
                    sM = None
                    dM = None
                    cM = None
                    measurement_duration = sample.get('measurement_duration')
                    
                    if t_half is not None and t_half > 0:
                        ln2_over_tHalf = np.log(2) / t_half  # Use np.log(2) for natural log
                        
                        if total_irradiation_time is not None:
                            sM = 1 - np.exp(-ln2_over_tHalf * total_irradiation_time)
                        
                        if decay_time is not None:
                            dM = np.exp(-ln2_over_tHalf * decay_time)
                        
                        if measurement_duration is not None and measurement_duration > 0:
                            denominator = ln2_over_tHalf * measurement_duration
                            if denominator != 0:
                                cM = (1 - np.exp(-ln2_over_tHalf * measurement_duration)) / denominator
                    
                    # Tính Qo(a) - cần alpha và Ecd(a) từ frontend, tạm thời để None
                    qo_a = None
                    
                    matching_standards = []
                    for std_info in standard_samples_info:
                        for std_peak in std_info.get('peaks', []):
                            std_element = std_peak.get('element_name', '').strip().upper() if std_peak.get('element_name') else ''
                            std_energy = std_peak.get('energy')
                            if not element_name or not std_element:
                                continue
                            if element_name.upper() != std_element:
                                continue
                            try:
                                energy_value = float(energy) if energy is not None else None
                                std_energy_value = float(std_energy) if std_energy is not None else None
                            except (TypeError, ValueError):
                                energy_value = std_energy_value = None
                            if energy_value is not None and std_energy_value is not None:
                                if abs(energy_value - std_energy_value) > 0.1:
                                    continue
                            matching_standards.append({
                                'standard_sample_name': std_info.get('standard_sample_name') or std_info.get('sample_name'),
                                'spectrum_name': std_info.get('spectrum_name'),
                                'sample_mass': std_info.get('sample_mass'),
                                'measurement_duration': std_info.get('measurement_duration'),
                                'measurement_start_time': std_info.get('measurement_start_time'),
                                'peak_area': std_peak.get('peak_area'),
                                's_m': std_peak.get('s_m'),
                                'd_m': std_peak.get('d_m'),
                                'c_m': std_peak.get('c_m'),
                                'concentration': std_peak.get('concentration'),
                                'position_in_container': std_info.get('position_in_container'),
                                'measurement_position': std_info.get('measurement_position')
                            })
                    
                    processed_elements.append({
                        'element_name': element_name,
                        'energy': energy,
                        'peak_area': peak_area_value,
                        'k0': nuclear_info.get('k0') if nuclear_info else None,
                        'q0': nuclear_info.get('Q0') if nuclear_info else None,
                        'er': nuclear_info.get('Er') if nuclear_info else None,
                        't_half': t_half,
                        's_m': sM,
                        'd_m': dM,
                        'c_m': cM,
                        'epsilon_p_a': epsilon_p_a_value,
                        'qo_a': qo_a,
                        'relative_standard_matches': matching_standards
                    })
            
            result.append({
                'spectrum_name': spectrum_name,
                'measurement_position': measurement_position,
                'position_in_container': sample.get('position_in_container', '') or '',
                'start_time': container.get('start_time', '') or '',
                'end_time': container.get('end_time', '') or '',
                'total_irradiation_time': total_irradiation_time,
                'measurement_start_time': sample.get('measurement_start_time', '') or '',
                'measurement_duration': sample.get('measurement_duration'),
                'sample_mass': sample.get('sample_mass'),
                'decay_time': decay_time,
                'elements': processed_elements,
                'standard_samples': standard_samples_info
            })
        
        return sorted(result, key=lambda x: x.get('spectrum_name', ''))

