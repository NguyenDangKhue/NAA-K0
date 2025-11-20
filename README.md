# NAA K0 - Hệ thống Quản lý Thông số Lò phản ứng và Detector

Hệ thống web quản lý thông số lò phản ứng và detector cho phương pháp phân tích kích hoạt neutron (NAA) theo phương pháp K0 và phương pháp tương đối.

## Tính năng

### 1. Quản lý Thông số Lò phản ứng
- **Hệ số f**: Hệ số f và sai số tương ứng
- **Hệ số α**: Hệ số alpha và sai số tương ứng
- **Vị trí chiếu**: Quản lý nhiều vị trí chiếu khác nhau trong lò
- **Ghi chú**: Thêm ghi chú cho mỗi thông số
- **Lưu trữ**: Lưu trữ và truy xuất dữ liệu từ file JSON

### 2. Quản lý Thông số Detector
- **Tên detector**: Quản lý nhiều detector khác nhau
- **Vị trí chiếu**: Liên kết với vị trí chiếu trong lò
- **Đường hiệu suất**: Hỗ trợ 2 loại đường hiệu suất:
  - **Bậc 4**: ε(E) = a₀ + a₁·ln(E) + a₂·ln(E)² + a₃·ln(E)³ + a₄·ln(E)⁴
  - **Bậc 5**: ε(E) = a₀ + a₁·ln(E) + a₂·ln(E)² + a₃·ln(E)³ + a₄·ln(E)⁴ + a₅·ln(E)⁵
- **Hệ số và sai số**: Quản lý các hệ số tự do và sai số tương ứng
- **Ghi chú**: Thêm ghi chú cho mỗi detector

### 3. Quản lý Dữ liệu Hạt nhân
- **Import từ CSV**: Tải dữ liệu hạt nhân từ file CSV
- **Export CSV**: Tải xuống toàn bộ dữ liệu dưới dạng CSV
- **File mẫu**: Tải file CSV mẫu để điền thông tin
- **Các trường dữ liệu**:
  - Code: Mã định danh
  - El: Nguyên tố
  - Emitter: Chất phát xạ
  - A: Số khối
  - E (keV): Năng lượng
  - k0: Hệ số k0
  - Q0: Hệ số Q0
  - T1/2: Chu kỳ bán rã
  - Er: Sai số
- **Cảnh báo**: Khi import CSV mới, toàn bộ dữ liệu cũ sẽ bị xóa và thay thế

## Cài đặt

### Yêu cầu hệ thống
- Python 3.7 trở lên
- pip (Python package manager)

### Các bước cài đặt

1. **Clone hoặc tải dự án về máy**

2. **Cài đặt các thư viện cần thiết:**
```bash
pip install -r requirements.txt
```

3. **Chạy ứng dụng:**
```bash
python app.py
```

4. **Truy cập ứng dụng:**
Mở trình duyệt và truy cập: `http://localhost:5000`

## Cấu trúc dự án

```
NAA-K0/
├── app.py                 # Flask application chính
├── models.py              # Models và DataManager
├── requirements.txt       # Danh sách dependencies
├── README.md             # File hướng dẫn
├── data/                 # Thư mục lưu trữ dữ liệu (tự động tạo)
│   ├── reactor_parameters.json
│   ├── detector_parameters.json
│   └── nuclear_data.json
├── templates/            # HTML templates
│   └── index.html
└── static/               # Static files
    ├── css/
    │   └── style.css
    └── js/
        └── main.js
```

## Sử dụng

### Thêm Thông số Lò phản ứng

1. Chuyển sang tab "Thông số Lò phản ứng"
2. Click nút "Thêm mới"
3. Điền các thông tin:
   - Vị trí chiếu (bắt buộc)
   - Hệ số f và sai số (bắt buộc)
   - Hệ số α và sai số (bắt buộc)
   - Ghi chú (tùy chọn)
4. Click "Lưu"

### Thêm Thông số Detector

1. Chuyển sang tab "Thông số Detector"
2. Click nút "Thêm mới"
3. Điền các thông tin:
   - Tên detector (bắt buộc)
   - Vị trí chiếu (bắt buộc)
   - Chọn loại đường hiệu suất: Bậc 4 hoặc Bậc 5
   - Điền các hệ số và sai số tương ứng
   - Ghi chú (tùy chọn)
4. Click "Lưu"

### Tìm kiếm và Lọc

- Sử dụng ô tìm kiếm ở đầu mỗi bảng để lọc dữ liệu theo vị trí chiếu hoặc tên detector

### Chỉnh sửa và Xóa

- Click nút "Sửa" để chỉnh sửa thông số
- Click nút "Xóa" để xóa thông số (có xác nhận)

### Quản lý Dữ liệu Hạt nhân

1. **Tải file mẫu CSV:**
   - Chuyển sang tab "Dữ liệu Hạt nhân"
   - Click nút "Tải file mẫu CSV"
   - Mở file CSV và điền thông tin theo định dạng

2. **Import dữ liệu:**
   - Click vào vùng upload hoặc chọn file CSV
   - Kéo thả file CSV vào vùng upload (hỗ trợ drag & drop)
   - Xác nhận cảnh báo về việc xóa dữ liệu cũ
   - Click "Import dữ liệu"

3. **Tải dữ liệu:**
   - Click nút "Tải dữ liệu CSV" để tải xuống toàn bộ dữ liệu hiện tại

4. **Tìm kiếm:**
   - Sử dụng các ô lọc để tìm kiếm theo Code, Nguyên tố, hoặc Emitter

⚠️ **LƯU Ý QUAN TRỌNG**: Khi import file CSV mới, TOÀN BỘ dữ liệu hạt nhân cũ sẽ bị XÓA và thay thế bằng dữ liệu mới. Vui lòng sao lưu dữ liệu cũ trước khi import.

## API Endpoints

### Reactor Parameters

- `GET /api/reactor/parameters` - Lấy tất cả thông số lò
- `GET /api/reactor/parameters?position=<vị_trí>` - Lọc theo vị trí
- `POST /api/reactor/parameters` - Thêm thông số lò mới
- `PUT /api/reactor/parameters/<id>` - Cập nhật thông số lò
- `DELETE /api/reactor/parameters/<id>` - Xóa thông số lò

### Detector Parameters

- `GET /api/detector/parameters` - Lấy tất cả thông số detector
- `GET /api/detector/parameters?detector_name=<tên>&position=<vị_trí>` - Lọc theo tên và vị trí
- `POST /api/detector/parameters` - Thêm thông số detector mới
- `PUT /api/detector/parameters/<id>` - Cập nhật thông số detector
- `DELETE /api/detector/parameters/<id>` - Xóa thông số detector

### Nuclear Data

- `GET /api/nuclear/data` - Lấy tất cả dữ liệu hạt nhân
- `POST /api/nuclear/data/upload` - Upload và import dữ liệu từ file CSV
- `GET /api/nuclear/data/download` - Tải xuống dữ liệu dưới dạng CSV
- `GET /api/nuclear/data/template` - Tải xuống file CSV mẫu

## Lưu trữ dữ liệu

Dữ liệu được lưu trữ dưới dạng JSON trong thư mục `data/`:
- `reactor_parameters.json`: Chứa tất cả thông số lò phản ứng
- `detector_parameters.json`: Chứa tất cả thông số detector
- `nuclear_data.json`: Chứa tất cả dữ liệu hạt nhân

**Định dạng CSV cho Dữ liệu Hạt nhân:**
File CSV phải có các cột sau (theo thứ tự):
- Code
- El
- Emitter
- A
- E (keV)
- k0
- Q0
- T1/2
- Er

## Ghi chú kỹ thuật

- Đường hiệu suất detector được tính theo công thức logarit với năng lượng E (keV)
- Tất cả các hệ số và sai số được lưu trữ với độ chính xác cao
- Hệ thống tự động tạo thư mục `data/` nếu chưa tồn tại
- Dữ liệu được lưu tự động sau mỗi thao tác thêm/sửa/xóa

## Phát triển tiếp theo

Các tính năng có thể mở rộng:
- Tính toán hàm lượng nguyên tố theo phương pháp K0
- Tính toán hàm lượng nguyên tố theo phương pháp tương đối
- Xuất báo cáo PDF
- Import/Export dữ liệu từ Excel
- Vẽ đồ thị đường hiệu suất detector

## Tác giả

Hệ thống được phát triển cho ứng dụng phân tích kích hoạt neutron (NAA).

## License

Dự án này được phát triển cho mục đích nghiên cứu và giáo dục.

