"""
Flask Application for NAA K0 Analysis - Reactor and Detector Parameters Management
"""
from flask import Flask, render_template, request, jsonify, send_file
from flask_cors import CORS
from models import DataManager, ReactorParameter, DetectorParameter
import traceback
import os
import tempfile
from datetime import datetime
import pandas as pd  # Dùng để tạo file CSV kết quả tính toán

app = Flask(__name__)
CORS(app)

# Initialize data manager
data_manager = DataManager()


def convert_datetime_for_csv(raw_value: str) -> str:
    """Convert HTML datetime-local value to dd/mm/yyyy HH:MM:SS for CSV."""
    if not raw_value:
        return ''
    value = str(raw_value).strip()
    if not value:
        return ''
    try:
        dt = datetime.fromisoformat(value)
        return dt.strftime('%d/%m/%Y %H:%M:%S')
    except ValueError:
        for fmt in ('%d/%m/%Y %H:%M:%S', '%d/%m/%Y %H:%M'):
            try:
                dt = datetime.strptime(value, fmt)
                return dt.strftime('%d/%m/%Y %H:%M:%S')
            except ValueError:
                continue
    return value


@app.route('/')
def index():
    """Trang chủ"""
    return render_template('index.html')


# ========== Reactor Parameter API ==========

@app.route('/api/reactor/parameters', methods=['GET'])
def get_reactor_parameters():
    """Lấy tất cả thông số lò"""
    try:
        position = request.args.get('position')
        if position:
            params = data_manager.get_reactor_parameter_by_position(position)
        else:
            params = data_manager.get_reactor_parameters()
        return jsonify({'success': True, 'data': params})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/reactor/positions', methods=['GET'])
def get_reactor_positions():
    """Lấy danh sách các vị trí chiếu duy nhất từ thông số lò"""
    try:
        positions = data_manager.get_unique_irradiation_positions()
        return jsonify({'success': True, 'data': positions})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/reactor/parameters', methods=['POST'])
def add_reactor_parameter():
    """Thêm thông số lò mới"""
    try:
        data = request.json
        param = ReactorParameter(
            position=data['position'],
            f_factor=float(data['f_factor']),
            f_uncertainty=float(data['f_uncertainty']),
            alpha_factor=float(data['alpha_factor']),
            alpha_uncertainty=float(data['alpha_uncertainty']),
            note=data.get('note', '')
        )
        param_id = data_manager.add_reactor_parameter(param)
        return jsonify({'success': True, 'id': param_id, 'message': 'Đã thêm thông số lò thành công'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400


@app.route('/api/reactor/parameters/<int:param_id>', methods=['PUT'])
def update_reactor_parameter(param_id):
    """Cập nhật thông số lò"""
    try:
        data = request.json
        param = ReactorParameter(
            position=data['position'],
            f_factor=float(data['f_factor']),
            f_uncertainty=float(data['f_uncertainty']),
            alpha_factor=float(data['alpha_factor']),
            alpha_uncertainty=float(data['alpha_uncertainty']),
            note=data.get('note', '')
        )
        success = data_manager.update_reactor_parameter(param_id, param)
        if success:
            return jsonify({'success': True, 'message': 'Đã cập nhật thông số lò thành công'})
        else:
            return jsonify({'success': False, 'error': 'Không tìm thấy thông số lò'}), 404
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400


@app.route('/api/reactor/parameters/<int:param_id>', methods=['DELETE'])
def delete_reactor_parameter(param_id):
    """Xóa thông số lò"""
    try:
        success = data_manager.delete_reactor_parameter(param_id)
        if success:
            return jsonify({'success': True, 'message': 'Đã xóa thông số lò thành công'})
        else:
            return jsonify({'success': False, 'error': 'Không tìm thấy thông số lò'}), 404
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ========== Detector Parameter API ==========

@app.route('/api/detector/parameters', methods=['GET'])
def get_detector_parameters():
    """Lấy tất cả thông số detector"""
    try:
        detector_name = request.args.get('detector_name')
        position = request.args.get('position')
        
        if detector_name and position:
            params = data_manager.get_detector_parameter_by_name_and_position(detector_name, position)
        else:
            params = data_manager.get_detector_parameters()
        return jsonify({'success': True, 'data': params})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/detector/parameters', methods=['POST'])
def add_detector_parameter():
    """Thêm thông số detector mới"""
    try:
        data = request.json
        param = DetectorParameter(
            detector_name=data['detector_name'],
            position=data['position'],
            efficiency_type=data['efficiency_type'],
            efficiency_coefficients=[float(c) for c in data['efficiency_coefficients']],
            coefficient_uncertainties=[float(c) for c in data['coefficient_uncertainties']],
            note=data.get('note', '')
        )
        param_id = data_manager.add_detector_parameter(param)
        return jsonify({'success': True, 'id': param_id, 'message': 'Đã thêm thông số detector thành công'})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 400


@app.route('/api/detector/parameters/<int:param_id>', methods=['PUT'])
def update_detector_parameter(param_id):
    """Cập nhật thông số detector"""
    try:
        data = request.json
        param = DetectorParameter(
            detector_name=data['detector_name'],
            position=data['position'],
            efficiency_type=data['efficiency_type'],
            efficiency_coefficients=[float(c) for c in data['efficiency_coefficients']],
            coefficient_uncertainties=[float(c) for c in data['coefficient_uncertainties']],
            note=data.get('note', '')
        )
        success = data_manager.update_detector_parameter(param_id, param)
        if success:
            return jsonify({'success': True, 'message': 'Đã cập nhật thông số detector thành công'})
        else:
            return jsonify({'success': False, 'error': 'Không tìm thấy thông số detector'}), 404
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400


@app.route('/api/detector/parameters/<int:param_id>', methods=['DELETE'])
def delete_detector_parameter(param_id):
    """Xóa thông số detector"""
    try:
        success = data_manager.delete_detector_parameter(param_id)
        if success:
            return jsonify({'success': True, 'message': 'Đã xóa thông số detector thành công'})
        else:
            return jsonify({'success': False, 'error': 'Không tìm thấy thông số detector'}), 404
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ========== Nuclear Data API ==========

@app.route('/api/nuclear/data', methods=['GET'])
def get_nuclear_data():
    """Lấy tất cả dữ liệu hạt nhân"""
    try:
        data = data_manager.get_nuclear_data()
        return jsonify({'success': True, 'data': data, 'count': len(data)})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/nuclear/data/upload', methods=['POST'])
def upload_nuclear_data():
    """Upload và import dữ liệu hạt nhân từ file CSV"""
    try:
        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'Không có file được tải lên'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'success': False, 'error': 'Chưa chọn file'}), 400
        
        if not file.filename.endswith('.csv'):
            return jsonify({'success': False, 'error': 'File phải có định dạng CSV'}), 400
        
        # Lưu file tạm thời
        temp_dir = tempfile.gettempdir()
        temp_path = os.path.join(temp_dir, file.filename)
        file.save(temp_path)
        
        try:
            # Import dữ liệu
            success, message, count = data_manager.import_nuclear_data_from_csv(temp_path)
            
            if success:
                return jsonify({
                    'success': True,
                    'message': message,
                    'count': count
                })
            else:
                return jsonify({'success': False, 'error': message}), 400
        finally:
            # Xóa file tạm, bỏ qua lỗi nếu file đã bị xóa hoặc đang được sử dụng
            if os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except OSError:
                    # Không để lỗi xóa file tạm làm hỏng toàn bộ tiến trình import
                    pass
                
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': f'Lỗi khi xử lý file: {str(e)}'}), 500


@app.route('/api/nuclear/data/download', methods=['GET'])
def download_nuclear_data():
    """Tải xuống tất cả dữ liệu hạt nhân dưới dạng CSV"""
    try:
        df = data_manager.get_nuclear_data_as_dataframe()
        
        # Tạo file tạm
        temp_dir = tempfile.gettempdir()
        temp_path = os.path.join(temp_dir, 'nuclear_data_export.csv')
        df.to_csv(temp_path, index=False, encoding='utf-8-sig')
        
        return send_file(
            temp_path,
            mimetype='text/csv',
            as_attachment=True,
            download_name='nuclear_data.csv'
        )
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/nuclear/data/template', methods=['GET'])
def download_template():
    """Tải xuống file CSV mẫu"""
    try:
        temp_dir = tempfile.gettempdir()
        temp_path = os.path.join(temp_dir, 'nuclear_data_template.csv')
        data_manager.create_template_csv(temp_path)
        
        return send_file(
            temp_path,
            mimetype='text/csv',
            as_attachment=True,
            download_name='nuclear_data_template.csv'
        )
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/nuclear/data', methods=['POST'])
def add_nuclear_data():
    """Thêm dữ liệu hạt nhân mới"""
    try:
        data = request.json
        
        # Xử lý giá trị None cho các trường số
        def safe_float_or_none(value):
            if value is None or value == '':
                return None
            try:
                return float(value)
            except (ValueError, TypeError):
                return None
        
        nuclear_data = {
            'code': str(data.get('code', '')).strip(),
            'element': str(data.get('element', '')).strip(),
            'emitter': str(data.get('emitter', '')).strip(),
            'A': safe_float_or_none(data.get('A')),
            'E': safe_float_or_none(data.get('E')),
            'k0': safe_float_or_none(data.get('k0')),
            'Q0': safe_float_or_none(data.get('Q0')),
            'T_half': safe_float_or_none(data.get('T_half')),
            'Er': safe_float_or_none(data.get('Er'))
        }
        
        data_id = data_manager.add_nuclear_data(nuclear_data)
        return jsonify({'success': True, 'id': data_id, 'message': 'Đã thêm dữ liệu hạt nhân thành công'})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 400


@app.route('/api/nuclear/data/<int:data_id>', methods=['PUT'])
def update_nuclear_data(data_id):
    """Cập nhật dữ liệu hạt nhân"""
    try:
        data = request.json
        
        # Xử lý giá trị None cho các trường số
        def safe_float_or_none(value):
            if value is None or value == '':
                return None
            try:
                return float(value)
            except (ValueError, TypeError):
                return None
        
        nuclear_data = {
            'code': str(data.get('code', '')).strip(),
            'element': str(data.get('element', '')).strip(),
            'emitter': str(data.get('emitter', '')).strip(),
            'A': safe_float_or_none(data.get('A')),
            'E': safe_float_or_none(data.get('E')),
            'k0': safe_float_or_none(data.get('k0')),
            'Q0': safe_float_or_none(data.get('Q0')),
            'T_half': safe_float_or_none(data.get('T_half')),
            'Er': safe_float_or_none(data.get('Er'))
        }
        
        success = data_manager.update_nuclear_data(data_id, nuclear_data)
        if success:
            return jsonify({'success': True, 'message': 'Đã cập nhật dữ liệu hạt nhân thành công'})
        else:
            return jsonify({'success': False, 'error': 'Không tìm thấy dữ liệu hạt nhân'}), 404
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 400


@app.route('/api/nuclear/data/<int:data_id>', methods=['DELETE'])
def delete_nuclear_data(data_id):
    """Xóa dữ liệu hạt nhân"""
    try:
        success = data_manager.delete_nuclear_data(data_id)
        if success:
            return jsonify({'success': True, 'message': 'Đã xóa dữ liệu hạt nhân thành công'})
        else:
            return jsonify({'success': False, 'error': 'Không tìm thấy dữ liệu hạt nhân'}), 404
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ========== Standard Sample Data API ==========

@app.route('/api/standard-sample/data', methods=['GET'])
def get_standard_sample_data():
    """Lấy tất cả dữ liệu mẫu chuẩn"""
    try:
        data = data_manager.get_standard_sample_data()
        return jsonify({'success': True, 'data': data, 'count': len(data)})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/standard-sample/sample-names', methods=['GET'])
def get_standard_sample_names():
    """Lấy danh sách tên mẫu chuẩn duy nhất"""
    try:
        data = data_manager.get_standard_sample_data()
        sample_names = sorted(list(set([item.get('sample_name', '') for item in data if item.get('sample_name')])))
        return jsonify({'success': True, 'data': sample_names})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/standard-sample/data', methods=['POST'])
def add_standard_sample_data():
    """Thêm dữ liệu mẫu chuẩn mới"""
    try:
        data = request.json
        
        def safe_float_or_none(value):
            if value is None or value == '':
                return None
            try:
                return float(value)
            except (ValueError, TypeError):
                return None
        
        sample_data = {
            'sample_name': str(data.get('sample_name', '')).strip(),
            'element': str(data.get('element', '')).strip(),
            'concentration': safe_float_or_none(data.get('concentration')),
            'uncertainty': safe_float_or_none(data.get('uncertainty'))
        }
        
        data_id = data_manager.add_standard_sample_data(sample_data)
        return jsonify({'success': True, 'id': data_id, 'message': 'Đã thêm dữ liệu mẫu chuẩn thành công'})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 400


@app.route('/api/standard-sample/data/<int:data_id>', methods=['PUT'])
def update_standard_sample_data(data_id):
    """Cập nhật dữ liệu mẫu chuẩn"""
    try:
        data = request.json
        
        def safe_float_or_none(value):
            if value is None or value == '':
                return None
            try:
                return float(value)
            except (ValueError, TypeError):
                return None
        
        sample_data = {
            'sample_name': str(data.get('sample_name', '')).strip(),
            'element': str(data.get('element', '')).strip(),
            'concentration': safe_float_or_none(data.get('concentration')),
            'uncertainty': safe_float_or_none(data.get('uncertainty'))
        }
        
        success = data_manager.update_standard_sample_data(data_id, sample_data)
        if success:
            return jsonify({'success': True, 'message': 'Đã cập nhật dữ liệu mẫu chuẩn thành công'})
        else:
            return jsonify({'success': False, 'error': 'Không tìm thấy dữ liệu mẫu chuẩn'}), 404
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 400


@app.route('/api/standard-sample/data/<int:data_id>', methods=['DELETE'])
def delete_standard_sample_data(data_id):
    """Xóa dữ liệu mẫu chuẩn"""
    try:
        success = data_manager.delete_standard_sample_data(data_id)
        if success:
            return jsonify({'success': True, 'message': 'Đã xóa dữ liệu mẫu chuẩn thành công'})
        else:
            return jsonify({'success': False, 'error': 'Không tìm thấy dữ liệu mẫu chuẩn'}), 404
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/standard-sample/sample/<sample_name>', methods=['PUT'])
def update_sample_name(sample_name):
    """Cập nhật tên mẫu chuẩn (đổi tên tất cả nguyên tố của mẫu chuẩn)"""
    try:
        data = request.json
        new_name = data.get('new_name', '').strip()
        
        if not new_name:
            return jsonify({'success': False, 'error': 'Tên mẫu chuẩn mới không được để trống'}), 400
        
        success, count = data_manager.update_sample_name(sample_name, new_name)
        if success:
            return jsonify({'success': True, 'message': f'Đã đổi tên mẫu chuẩn thành công ({count} nguyên tố)'})
        else:
            return jsonify({'success': False, 'error': 'Không tìm thấy mẫu chuẩn'}), 404
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/standard-sample/sample/<sample_name>', methods=['DELETE'])
def delete_sample(sample_name):
    """Xóa toàn bộ mẫu chuẩn (xóa tất cả nguyên tố của mẫu chuẩn)"""
    try:
        success, count = data_manager.delete_sample(sample_name)
        if success:
            return jsonify({'success': True, 'message': f'Đã xóa mẫu chuẩn thành công ({count} nguyên tố)'})
        else:
            return jsonify({'success': False, 'error': 'Không tìm thấy mẫu chuẩn'}), 404
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/standard-sample/data/upload', methods=['POST'])
def upload_standard_sample_data():
    """Upload và import dữ liệu mẫu chuẩn từ file CSV (thêm vào, không xóa dữ liệu cũ)"""
    try:
        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'Không có file được tải lên'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'success': False, 'error': 'Chưa chọn file'}), 400
        
        if not file.filename.endswith('.csv'):
            return jsonify({'success': False, 'error': 'File phải có định dạng CSV'}), 400
        
        # Lưu file tạm thời
        temp_dir = tempfile.gettempdir()
        temp_path = os.path.join(temp_dir, file.filename)
        file.save(temp_path)
        
        try:
            # Import dữ liệu (thêm vào, không xóa dữ liệu cũ)
            success, message, count = data_manager.import_standard_sample_data_from_csv(temp_path)
            
            if success:
                return jsonify({
                    'success': True,
                    'message': message,
                    'count': count
                })
            else:
                return jsonify({'success': False, 'error': message}), 400
        finally:
            # Xóa file tạm, bỏ qua lỗi nếu file đã bị xóa hoặc đang được sử dụng
            if os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except OSError:
                    pass
                
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': f'Lỗi khi xử lý file: {str(e)}'}), 500


@app.route('/api/standard-sample/data/download', methods=['GET'])
def download_standard_sample_data():
    """Tải xuống tất cả dữ liệu mẫu chuẩn dưới dạng CSV"""
    try:
        df = data_manager.get_standard_sample_data_as_dataframe()
        
        # Tạo file tạm
        temp_dir = tempfile.gettempdir()
        temp_path = os.path.join(temp_dir, 'standard_sample_data_export.csv')
        df.to_csv(temp_path, index=False, encoding='utf-8-sig')
        
        return send_file(
            temp_path,
            mimetype='text/csv',
            as_attachment=True,
            download_name='standard_sample_data.csv'
        )
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/standard-sample/data/template', methods=['GET'])
def download_standard_sample_template():
    """Tải xuống file CSV mẫu cho dữ liệu mẫu chuẩn"""
    try:
        temp_dir = tempfile.gettempdir()
        temp_path = os.path.join(temp_dir, 'standard_sample_data_template.csv')
        data_manager.create_standard_sample_template_csv(temp_path)
        
        return send_file(
            temp_path,
            mimetype='text/csv',
            as_attachment=True,
            download_name='standard_sample_data_template.csv'
        )
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ========== Irradiated Container and Sample API ==========

@app.route('/api/irradiated/containers', methods=['GET'])
def get_irradiated_containers():
    """Lấy tất cả container chiếu"""
    try:
        data = data_manager.get_irradiated_containers()
        return jsonify({'success': True, 'data': data, 'count': len(data)})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/irradiated/containers', methods=['POST'])
def add_irradiated_container():
    """Thêm container chiếu mới"""
    try:
        data = request.json
        container_data = {
            'container_name': str(data.get('container_name', '')).strip(),
            'irradiation_position': str(data.get('irradiation_position', '')).strip(),
            'start_time': str(data.get('start_time', '')).strip(),
            'end_time': str(data.get('end_time', '')).strip(),
            'note': str(data.get('note', '')).strip() if data.get('note') else ''
        }
        
        container_id = data_manager.add_irradiated_container(container_data)
        return jsonify({'success': True, 'id': container_id, 'message': 'Đã thêm container chiếu thành công'})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 400


@app.route('/api/irradiated/containers/<int:container_id>', methods=['PUT'])
def update_irradiated_container(container_id):
    """Cập nhật container chiếu"""
    try:
        data = request.json
        container_data = {
            'container_name': str(data.get('container_name', '')).strip(),
            'irradiation_position': str(data.get('irradiation_position', '')).strip(),
            'start_time': str(data.get('start_time', '')).strip(),
            'end_time': str(data.get('end_time', '')).strip(),
            'note': str(data.get('note', '')).strip() if data.get('note') else ''
        }
        
        success = data_manager.update_irradiated_container(container_id, container_data)
        if success:
            return jsonify({'success': True, 'message': 'Đã cập nhật container chiếu thành công'})
        else:
            return jsonify({'success': False, 'error': 'Không tìm thấy container chiếu'}), 404
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 400


@app.route('/api/irradiated/containers/<int:container_id>', methods=['DELETE'])
def delete_irradiated_container(container_id):
    """Xóa container chiếu và tất cả mẫu trong container"""
    try:
        success = data_manager.delete_irradiated_container(container_id)
        if success:
            return jsonify({'success': True, 'message': 'Đã xóa container chiếu và tất cả mẫu trong container thành công'})
        else:
            return jsonify({'success': False, 'error': 'Không tìm thấy container chiếu'}), 404
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/irradiated/samples', methods=['GET'])
def get_irradiated_samples():
    """Lấy tất cả mẫu đã chiếu, có thể lọc theo container"""
    try:
        container_name = request.args.get('container_name')
        data = data_manager.get_irradiated_samples(container_name)
        return jsonify({'success': True, 'data': data, 'count': len(data)})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/irradiated/samples', methods=['POST'])
def add_irradiated_sample():
    """Thêm mẫu đã chiếu mới"""
    try:
        data = request.json
        
        def safe_float_or_none(value):
            if value is None or value == '':
                return None
            try:
                return float(value)
            except (ValueError, TypeError):
                return None
        
        sample_data = {
            'container_name': str(data.get('container_name', '')).strip(),
            'sample_name': str(data.get('sample_name', '')).strip(),
            'spectrum_name': str(data.get('spectrum_name', '')).strip(),
            'position_in_container': str(data.get('position_in_container', '')).strip(),
            'measurement_start_time': str(data.get('measurement_start_time', '')).strip(),
            'measurement_duration': safe_float_or_none(data.get('measurement_duration')),
            'sample_mass': safe_float_or_none(data.get('sample_mass')),
            'is_monitor': bool(data.get('is_monitor', False)),
            'is_standard_sample': bool(data.get('is_standard_sample', False)),
            'standard_sample_name': str(data.get('standard_sample_name', '')).strip() if data.get('is_standard_sample') else ''
        }
        
        sample_id = data_manager.add_irradiated_sample(sample_data)
        return jsonify({'success': True, 'id': sample_id, 'message': 'Đã thêm mẫu đã chiếu thành công'})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 400


@app.route('/api/irradiated/samples/<int:sample_id>', methods=['PUT'])
def update_irradiated_sample(sample_id):
    """Cập nhật mẫu đã chiếu"""
    try:
        data = request.json
        
        def safe_float_or_none(value):
            if value is None or value == '':
                return None
            try:
                return float(value)
            except (ValueError, TypeError):
                return None
        
        sample_data = {
            'container_name': str(data.get('container_name', '')).strip(),
            'sample_name': str(data.get('sample_name', '')).strip(),
            'spectrum_name': str(data.get('spectrum_name', '')).strip(),
            'position_in_container': str(data.get('position_in_container', '')).strip(),
            'measurement_start_time': str(data.get('measurement_start_time', '')).strip(),
            'measurement_duration': safe_float_or_none(data.get('measurement_duration')),
            'sample_mass': safe_float_or_none(data.get('sample_mass')),
            'is_monitor': bool(data.get('is_monitor', False)),
            'is_standard_sample': bool(data.get('is_standard_sample', False)),
            'standard_sample_name': str(data.get('standard_sample_name', '')).strip() if data.get('is_standard_sample') else ''
        }
        
        success = data_manager.update_irradiated_sample(sample_id, sample_data)
        if success:
            return jsonify({'success': True, 'message': 'Đã cập nhật mẫu đã chiếu thành công'})
        else:
            return jsonify({'success': False, 'error': 'Không tìm thấy mẫu đã chiếu'}), 404
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 400


@app.route('/api/irradiated/samples/<int:sample_id>', methods=['DELETE'])
def delete_irradiated_sample(sample_id):
    """Xóa mẫu đã chiếu"""
    try:
        success = data_manager.delete_irradiated_sample(sample_id)
        if success:
            return jsonify({'success': True, 'message': 'Đã xóa mẫu đã chiếu thành công'})
        else:
            return jsonify({'success': False, 'error': 'Không tìm thấy mẫu đã chiếu'}), 404
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/irradiated/data/upload', methods=['POST'])
def upload_irradiated_data():
    """Upload và import dữ liệu mẫu đã chiếu từ file CSV"""
    try:
        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'Không có file được tải lên'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'success': False, 'error': 'Chưa chọn file'}), 400
        
        if not file.filename.endswith('.csv'):
            return jsonify({'success': False, 'error': 'File phải có định dạng CSV'}), 400
        
        temp_dir = tempfile.gettempdir()
        temp_path = os.path.join(temp_dir, file.filename)
        file.save(temp_path)
        
        try:
            success, message, container_count, sample_count = data_manager.import_irradiated_data_from_csv(temp_path)
            
            if success:
                return jsonify({
                    'success': True,
                    'message': message,
                    'container_count': container_count,
                    'sample_count': sample_count
                })
            else:
                return jsonify({'success': False, 'error': message}), 400
        finally:
            # Xóa file tạm, bỏ qua lỗi nếu file đã bị xóa hoặc đang được sử dụng
            if os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except OSError:
                    pass
                
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': f'Lỗi khi xử lý file: {str(e)}'}), 500


@app.route('/api/irradiated/data/template', methods=['GET'])
def download_irradiated_template():
    """Tải xuống file CSV mẫu cho dữ liệu mẫu đã chiếu"""
    try:
        temp_dir = tempfile.gettempdir()
        temp_path = os.path.join(temp_dir, 'irradiated_data_template.csv')
        data_manager.create_irradiated_data_template_csv(temp_path)
        
        return send_file(
            temp_path,
            mimetype='text/csv',
            as_attachment=True,
            download_name='irradiated_data_template.csv'
        )
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/irradiated/process-spe-files', methods=['POST'])
def process_spe_files():
    """Xử lý các file .Spe và tạo file CSV với dữ liệu đã điền sẵn"""
    try:
        container_name = (request.form.get('container_name') or '').strip()
        irradiation_position = (request.form.get('irradiation_position') or '').strip()
        irradiation_start_time = convert_datetime_for_csv(request.form.get('irradiation_start_time'))
        irradiation_end_time = convert_datetime_for_csv(request.form.get('irradiation_end_time'))
        
        if irradiation_position:
            valid_positions = data_manager.get_unique_irradiation_positions()
            if irradiation_position not in valid_positions:
                return jsonify({'success': False, 'error': 'Vị trí chiếu không hợp lệ'}), 400
        
        if 'files' not in request.files:
            return jsonify({'success': False, 'error': 'Không có file được tải lên'}), 400
        
        files = request.files.getlist('files')
        if not files or all(f.filename == '' for f in files):
            return jsonify({'success': False, 'error': 'Chưa chọn file .Spe nào'}), 400
        
        # Lọc chỉ lấy file .Spe
        spe_files = [f for f in files if f.filename.lower().endswith('.spe')]
        if not spe_files:
            return jsonify({'success': False, 'error': 'Không có file .Spe hợp lệ'}), 400
        
        # Lưu các file tạm thời
        temp_dir = tempfile.gettempdir()
        spe_file_paths = []
        
        try:
            for spe_file in spe_files:
                temp_path = os.path.join(temp_dir, spe_file.filename)
                spe_file.save(temp_path)
                spe_file_paths.append(temp_path)
            
            # Xử lý các file .Spe và tạo CSV
            output_csv_path = os.path.join(temp_dir, 'irradiated_data_from_spe.csv')
            success, message, count = data_manager.process_spe_files_to_csv(
                spe_file_paths,
                output_csv_path,
                default_container_name=container_name,
                default_position=irradiation_position,
                default_start_time=irradiation_start_time,
                default_end_time=irradiation_end_time
            )
            
            if success:
                # Trả về file CSV để download
                return send_file(
                    output_csv_path,
                    mimetype='text/csv',
                    as_attachment=True,
                    download_name='irradiated_data_from_spe.csv'
                )
            else:
                return jsonify({'success': False, 'error': message}), 400
                
        finally:
            # Xóa các file tạm
            for path in spe_file_paths:
                if os.path.exists(path):
                    try:
                        os.remove(path)
                    except:
                        pass
            # Xóa file CSV output sau khi gửi (sẽ được xóa tự động bởi send_file)
            
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': f'Lỗi khi xử lý file .Spe: {str(e)}'}), 500


# ========== Peak Area Data API ==========

@app.route('/api/peak-area/data', methods=['GET'])
def get_peak_area_data():
    """Lấy tất cả dữ liệu diện tích đỉnh, có thể lọc theo container hoặc spectrum"""
    try:
        container_name = request.args.get('container_name')
        spectrum_name = request.args.get('spectrum_name')
        data = data_manager.get_peak_area_data(container_name, spectrum_name)
        return jsonify({'success': True, 'data': data, 'count': len(data)})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/peak-area/data', methods=['POST'])
def add_peak_area_data():
    """Thêm dữ liệu diện tích đỉnh mới"""
    try:
        data = request.json
        
        def safe_float_or_none(value):
            if value is None or value == '':
                return None
            try:
                return float(value)
            except (ValueError, TypeError):
                return None
        
        peak_area_data = {
            'container_name': str(data.get('container_name', '')).strip(),
            'spectrum_name': str(data.get('spectrum_name', '')).strip(),
            'element_name': str(data.get('element_name', '')).strip(),
            'energy': float(data.get('energy', 0)),
            'peak_area': float(data.get('peak_area', 0)),
            'peak_area_error': safe_float_or_none(data.get('peak_area_error'))
        }
        
        data_id = data_manager.add_peak_area_data(peak_area_data)
        return jsonify({'success': True, 'id': data_id, 'message': 'Đã thêm dữ liệu diện tích đỉnh thành công'})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/peak-area/data/<int:data_id>', methods=['PUT'])
def update_peak_area_data(data_id):
    """Cập nhật dữ liệu diện tích đỉnh"""
    try:
        data = request.json
        
        def safe_float_or_none(value):
            if value is None or value == '':
                return None
            try:
                return float(value)
            except (ValueError, TypeError):
                return None
        
        peak_area_data = {
            'container_name': str(data.get('container_name', '')).strip(),
            'spectrum_name': str(data.get('spectrum_name', '')).strip(),
            'element_name': str(data.get('element_name', '')).strip(),
            'energy': float(data.get('energy', 0)),
            'peak_area': float(data.get('peak_area', 0)),
            'peak_area_error': safe_float_or_none(data.get('peak_area_error'))
        }
        
        success = data_manager.update_peak_area_data(data_id, peak_area_data)
        if success:
            return jsonify({'success': True, 'message': 'Đã cập nhật dữ liệu diện tích đỉnh thành công'})
        else:
            return jsonify({'success': False, 'error': 'Không tìm thấy dữ liệu diện tích đỉnh'}), 404
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/peak-area/data/<int:data_id>', methods=['DELETE'])
def delete_peak_area_data(data_id):
    """Xóa dữ liệu diện tích đỉnh"""
    try:
        success = data_manager.delete_peak_area_data(data_id)
        if success:
            return jsonify({'success': True, 'message': 'Đã xóa dữ liệu diện tích đỉnh thành công'})
        else:
            return jsonify({'success': False, 'error': 'Không tìm thấy dữ liệu diện tích đỉnh'}), 404
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/peak-area/container/<container_name>', methods=['DELETE'])
def delete_peak_area_container(container_name):
    """Xóa tất cả dữ liệu diện tích đỉnh theo tên container"""
    try:
        deleted_count = data_manager.delete_peak_area_data_by_container(container_name)
        if deleted_count > 0:
            return jsonify({'success': True, 'message': f'Đã xóa {deleted_count} bản ghi của container "{container_name}" thành công'})
        else:
            return jsonify({'success': False, 'error': 'Không tìm thấy dữ liệu cho container này'}), 404
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/peak-area/containers', methods=['GET'])
def get_peak_area_containers():
    """Lấy danh sách tên container"""
    try:
        containers = data_manager.get_irradiated_containers()
        container_names = [c.get('container_name', '') for c in containers if c.get('container_name')]
        return jsonify({'success': True, 'data': sorted(list(set(container_names)))})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/peak-area/spectrum-names', methods=['GET'])
def get_peak_area_spectrum_names():
    """Lấy danh sách tên phổ theo container"""
    try:
        container_name = request.args.get('container_name')
        if not container_name:
            return jsonify({'success': False, 'error': 'Thiếu tham số container_name'}), 400
        
        spectrum_names = data_manager.get_spectrum_names_by_container(container_name)
        return jsonify({'success': True, 'data': spectrum_names})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/peak-area/elements', methods=['GET'])
def get_peak_area_elements():
    """Lấy danh sách các nguyên tố duy nhất"""
    try:
        elements = data_manager.get_unique_elements()
        return jsonify({'success': True, 'data': elements})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/peak-area/energies', methods=['GET'])
def get_peak_area_energies():
    """Lấy danh sách năng lượng theo nguyên tố"""
    try:
        element = request.args.get('element')
        if not element:
            return jsonify({'success': False, 'error': 'Thiếu tham số element'}), 400
        
        energies = data_manager.get_energies_by_element(element)
        return jsonify({'success': True, 'data': energies})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ========== Calculation Result API ==========

@app.route('/api/calculation/monitor-spectra', methods=['GET'])
def get_monitor_spectra():
    """Lấy danh sách các phổ lá dò trong container để tính toán"""
    try:
        container_name = request.args.get('container_name')
        if not container_name:
            return jsonify({'success': False, 'error': 'Thiếu tham số container_name'}), 400
        
        monitor_spectra = data_manager.get_monitor_spectra_for_calculation(container_name)
        return jsonify({'success': True, 'data': monitor_spectra, 'count': len(monitor_spectra)})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/calculation/non-monitor-spectra', methods=['GET'])
def get_non_monitor_spectra():
    """Lấy danh sách các phổ không phải lá dò trong container để tính toán"""
    try:
        container_name = request.args.get('container_name')
        if not container_name:
            return jsonify({'success': False, 'error': 'Thiếu tham số container_name'}), 400
        
        non_monitor_spectra = data_manager.get_non_monitor_spectra_for_calculation(container_name)
        return jsonify({'success': True, 'data': non_monitor_spectra, 'count': len(non_monitor_spectra)})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/calculation/results', methods=['GET'])
def get_calculation_results():
    """Lấy tất cả kết quả tính toán đã lưu theo container"""
    try:
        results = data_manager.get_calculation_results()
        return jsonify({'success': True, 'data': results, 'count': len(results)})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/calculation/results', methods=['POST'])
def add_calculation_result():
    """
    Lưu một bản ghi kết quả tính toán cho container hiện tại.
    Frontend gửi lên:
        {
            "container_name": "Tên container",
            "details": [  # Tùy chọn
                {
                    "sample_name": "...",
                    "spectrum_name": "...",
                    "element_name": "...",
                    "energy": 0.0,
                    "k0_concentration": 0.0,
                    "relative_concentration": 0.0,
                    "relative_standard_name": "..."
                },
                ...
            ]
        }
    Thời gian lưu (saved_at) sẽ được backend tự động thêm theo thời gian hiện tại.
    """
    try:
        data = request.json or {}
        container_name = (data.get('container_name') or '').strip()
        if not container_name:
            return jsonify({'success': False, 'error': 'Thiếu tên container'}), 400

        details = data.get('details') or []
        if not isinstance(details, list):
            details = []

        # Bổ sung tên mẫu dựa trên tên phổ và container từ dữ liệu "Mẫu đã chiếu"
        enriched_details = []
        for item in details:
            if not isinstance(item, dict):
                continue
            spectrum_name = (item.get('spectrum_name') or '').strip()
            sample_name = (item.get('sample_name') or '').strip()
            if not sample_name and spectrum_name:
                found_name = data_manager.get_sample_name_by_container_and_spectrum(container_name, spectrum_name)
                if found_name:
                    item['sample_name'] = found_name
            enriched_details.append(item)

        saved_at = datetime.now().isoformat()
        result_id = data_manager.add_calculation_result(container_name, saved_at, enriched_details)
        return jsonify({
            'success': True,
            'id': result_id,
            'message': 'Đã lưu kết quả tính toán cho container thành công'
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/calculation/results/<int:result_id>', methods=['DELETE'])
def delete_calculation_result(result_id):
    """Xóa một bản ghi kết quả tính toán đã lưu"""
    try:
        success = data_manager.delete_calculation_result(result_id)
        if success:
            return jsonify({'success': True, 'message': 'Đã xóa kết quả tính toán thành công'})
        return jsonify({'success': False, 'error': 'Không tìm thấy kết quả tính toán'}), 404
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/calculation/results/<int:result_id>/download', methods=['GET'])
def download_calculation_result(result_id):
    """Tải kết quả tính toán đã lưu của một container dưới dạng file CSV (mở được bằng Excel)"""
    try:
        record = data_manager.get_calculation_result_by_id(result_id)
        if not record:
            return jsonify({'success': False, 'error': 'Không tìm thấy kết quả tính toán'}), 404

        details = record.get('details') or []
        if not isinstance(details, list):
            details = []

        # Chuẩn bị dữ liệu cho DataFrame
        rows = []
        for item in details:
            if not isinstance(item, dict):
                continue
            relative_standard_name = (item.get('relative_standard_name') or '').strip()
            relative_standard_spectrum = (item.get('relative_standard_spectrum_name') or '').strip()
            if relative_standard_name and relative_standard_spectrum:
                relative_standard_display = f"{relative_standard_name} ({relative_standard_spectrum})"
            else:
                relative_standard_display = relative_standard_name

            rows.append({
                'Tên mẫu': (item.get('sample_name') or '').strip(),
                'Tên phổ': (item.get('spectrum_name') or '').strip(),
                'Nguyên tố': (item.get('element_name') or '').strip(),
                'Năng lượng (keV)': item.get('energy'),
                'Hàm lượng K0 (ppm)': item.get('k0_concentration'),
                'Hàm lượng tương đối (ppm)': item.get('relative_concentration'),
                'Tên mẫu chuẩn (tương đối)': relative_standard_display
            })

        df = pd.DataFrame(rows, columns=[
            'Tên mẫu',
            'Tên phổ',
            'Nguyên tố',
            'Năng lượng (keV)',
            'Hàm lượng K0 (ppm)',
            'Hàm lượng tương đối (ppm)',
            'Tên mẫu chuẩn (tương đối)'
        ])

        # Tạo file tạm CSV
        temp_dir = tempfile.gettempdir()
        safe_container_name = (record.get('container_name') or 'container').replace('/', '_').replace('\\', '_')
        filename = f'calculation_result_{safe_container_name}.csv'
        temp_path = os.path.join(temp_dir, filename)
        df.to_csv(temp_path, index=False, encoding='utf-8-sig')

        return send_file(
            temp_path,
            mimetype='text/csv',
            as_attachment=True,
            download_name=filename
        )
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': f'Lỗi khi tạo file tải về: {str(e)}'}), 500


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)

