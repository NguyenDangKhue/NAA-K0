# TỔNG HỢP CÁC CÔNG THỨC TÍNH TOÁN TRONG PHẦN MỀM NAA-K0

Tài liệu này tổng hợp tất cả các công thức tính toán được sử dụng trong phần mềm phân tích kích hoạt neutron (NAA-K0), bao gồm các ký hiệu và ý nghĩa của từng tham số.

---

## 1. CÔNG THỨC TÍNH HIỆU SUẤT DETECTOR (ε)

### 1.1. Đường hiệu suất bậc 4

**Công thức:**
```
ε(E) = a₀ + a₁·ln(E) + a₂·ln(E)² + a₃·ln(E)³ + a₄·ln(E)⁴
```

**Ký hiệu:**
- **ε(E)**: Hiệu suất detector tại năng lượng E (không thứ nguyên)
- **E**: Năng lượng gamma (keV)
- **a₀, a₁, a₂, a₃, a₄**: Các hệ số của đường hiệu suất bậc 4
- **ln(E)**: Logarit tự nhiên (cơ số e) của năng lượng E

**Ghi chú:** Công thức này được sử dụng khi detector có đường hiệu suất bậc 4 với 5 hệ số.

---

### 1.2. Đường hiệu suất bậc 5

**Công thức:**
```
ε(E) = a₀ + a₁·ln(E) + a₂·ln(E)² + a₃·ln(E)³ + a₄·ln(E)⁴ + a₅·ln(E)⁵
```

**Ký hiệu:**
- **ε(E)**: Hiệu suất detector tại năng lượng E (không thứ nguyên)
- **E**: Năng lượng gamma (keV)
- **a₀, a₁, a₂, a₃, a₄, a₅**: Các hệ số của đường hiệu suất bậc 5
- **ln(E)**: Logarit tự nhiên (cơ số e) của năng lượng E

**Ghi chú:** Công thức này được sử dụng khi detector có đường hiệu suất bậc 5 với 6 hệ số.

---

### 1.3. Công thức tính εp,(a) từ logarit thập phân (trong Python backend)

**Công thức bậc 4:**
```
exponent = a₄·(log₁₀(E))⁴ + a₃·(log₁₀(E))³ + a₂·(log₁₀(E))² + a₁·log₁₀(E) + a₀
εp,(a) = 10^exponent
```

**Công thức bậc 5:**
```
exponent = a₅·(log₁₀(E))⁵ + a₄·(log₁₀(E))⁴ + a₃·(log₁₀(E))³ + a₂·(log₁₀(E))² + a₁·log₁₀(E) + a₀
εp,(a) = 10^exponent
```

**Ký hiệu:**
- **εp,(a)**: Hiệu suất đỉnh tại năng lượng a (không thứ nguyên)
- **E**: Năng lượng gamma (keV)
- **a₀, a₁, a₂, a₃, a₄, a₅**: Các hệ số của đường hiệu suất
- **log₁₀(E)**: Logarit thập phân (cơ số 10) của năng lượng E

**Ghi chú:** Đây là cách tính hiệu suất trong backend Python, sử dụng logarit thập phân và hàm mũ 10.

---

## 2. CÔNG THỨC TÍNH Q₀(a)

**Công thức:**
```
Q₀(a) = (Q₀ - 0.429) / Er(a)^α + 0.429 / (Ecd(a)^α · (2·α + 1))
```

**Ký hiệu:**
- **Q₀(a)**: Hệ số Q₀ tại năng lượng a (không thứ nguyên)
- **Q₀**: Hệ số Q₀ của nguyên tố (giá trị mặc định: 15.7 cho Au)
- **Er(a)**: Năng lượng tham chiếu tại năng lượng a (keV, giá trị mặc định: 5.65 cho Au)
- **Ecd(a)**: Năng lượng cắt dưới tại năng lượng a (keV, giá trị mặc định: 0.55)
- **α**: Hệ số alpha (tham số phụ thuộc vào vị trí chiếu trong lò)

**Ghi chú:** 
- Công thức này được sử dụng để tính Q₀(a) cho cả lá dò (monitor) và các nguyên tố khác.
- Đối với lá dò (Au), giá trị mặc định Q₀ = 15.7 và Er(a) = 5.65.
- Đối với các nguyên tố khác, Q₀ và Er(a) được lấy từ dữ liệu hạt nhân.

---

## 3. CÔNG THỨC TÍNH S(m), D(m), C(m)

### 3.1. S(m) - Hệ số bão hòa

**Công thức:**
```
S(m) = 1 - exp(-(ln(2) / T₁/₂) · t_irradiation)
```

**Ký hiệu:**
- **S(m)**: Hệ số bão hòa (không thứ nguyên)
- **T₁/₂**: Chu kỳ bán rã của đồng vị (giây)
- **t_irradiation**: Tổng thời gian chiếu xạ (giây)
- **ln(2)**: Logarit tự nhiên của 2 (≈ 0.693)
- **exp()**: Hàm mũ tự nhiên (e^x)

**Ghi chú:** 
- S(m) đại diện cho mức độ bão hòa của đồng vị phóng xạ trong quá trình chiếu xạ.
- Đối với lá dò (monitor), sử dụng T₁/₂ của Au.
- Đối với các nguyên tố khác, sử dụng T₁/₂ của nguyên tố đó, nếu không có thì dùng T₁/₂ của Au.

---

### 3.2. D(m) - Hệ số phân rã

**Công thức:**
```
D(m) = exp(-(ln(2) / T₁/₂) · t_decay)
```

**Ký hiệu:**
- **D(m)**: Hệ số phân rã (không thứ nguyên)
- **T₁/₂**: Chu kỳ bán rã của đồng vị (giây)
- **t_decay**: Thời gian rã (thời gian từ khi kết thúc chiếu đến khi bắt đầu đo) (giây)
- **ln(2)**: Logarit tự nhiên của 2 (≈ 0.693)
- **exp()**: Hàm mũ tự nhiên (e^x)

**Ghi chú:** 
- D(m) đại diện cho sự suy giảm hoạt độ phóng xạ do phân rã trong thời gian chờ.
- Giá trị D(m) nằm trong khoảng 0 đến 1.

---

### 3.3. C(m) - Hệ số đo

**Công thức:**
```
C(m) = (1 - exp(-(ln(2) / T₁/₂) · t_measurement)) / ((ln(2) / T₁/₂) · t_measurement)
```

**Ký hiệu:**
- **C(m)**: Hệ số đo (không thứ nguyên)
- **T₁/₂**: Chu kỳ bán rã của đồng vị (giây)
- **t_measurement**: Thời gian đo phổ (giây)
- **ln(2)**: Logarit tự nhiên của 2 (≈ 0.693)
- **exp()**: Hàm mũ tự nhiên (e^x)

**Ghi chú:** 
- C(m) đại diện cho hiệu ứng của thời gian đo đối với số đếm phóng xạ.
- Công thức này điều chỉnh cho việc phân rã trong quá trình đo.

---

## 4. CÔNG THỨC TÍNH Aₛₚ (Lá dò)

**Công thức:**
```
Aₛₚ = (Diện_tích_đỉnh / Thời_gian_đo) / (S(m) · D(m) · C(m) · (Khối_lượng · 0.001))
```

**Hoặc viết dưới dạng:**
```
Aₛₚ = (peak_area / measurement_duration) / (S(m) · D(m) · C(m) · (sample_mass · 0.001))
```

**Ký hiệu:**
- **Aₛₚ**: Hoạt độ chuẩn hóa của lá dò (đơn vị: counts·s⁻¹·g⁻¹)
- **peak_area**: Diện tích đỉnh phổ của lá dò (counts)
- **measurement_duration**: Thời gian đo phổ (giây)
- **S(m)**: Hệ số bão hòa (không thứ nguyên)
- **D(m)**: Hệ số phân rã (không thứ nguyên)
- **C(m)**: Hệ số đo (không thứ nguyên)
- **sample_mass**: Khối lượng mẫu lá dò (gram)
- **0.001**: Hệ số chuyển đổi từ gram sang kilogram (hoặc hệ số chuẩn hóa)

**Ghi chú:** 
- Aₛₚ được tính cho lá dò (monitor) và được sử dụng để tính thông lượng neutron.
- Hệ số 0.001 có thể là hệ số chuẩn hóa hoặc chuyển đổi đơn vị.

---

## 5. CÔNG THỨC TÍNH THÔNG LƯỢNG NEUTRON (Neutron Flux)

**Công thức:**
```
Φ = (Aₛₚ · Constant · f) / ((f + Q₀(a)) · εp,(a))
```

**Trong đó:**
```
Constant = 197 / (6.023·10²³ · 98.65·10⁻²⁴ · 1 · 0.955)
```

**Ký hiệu:**
- **Φ**: Thông lượng neutron (n·cm⁻²·s⁻¹)
- **Aₛₚ**: Hoạt độ chuẩn hóa của lá dò (counts·s⁻¹·g⁻¹)
- **Constant**: Hằng số tính toán (≈ 3.45·10⁻²¹)
  - **197**: Khối lượng nguyên tử của Au (amu)
  - **6.023·10²³**: Số Avogadro (mol⁻¹)
  - **98.65·10⁻²⁴**: Tiết diện bắt neutron của Au (cm²)
  - **1**: Hệ số (có thể là hệ số hiệu chỉnh)
  - **0.955**: Hệ số hiệu chỉnh (có thể là độ phong phú đồng vị)
- **f**: Tỷ số thông lượng epithermal/thermal (không thứ nguyên)
- **Q₀(a)**: Hệ số Q₀ tại năng lượng a của lá dò (không thứ nguyên)
- **εp,(a)**: Hiệu suất đỉnh tại năng lượng a của lá dò (không thứ nguyên)

**Ghi chú:** 
- Công thức này tính thông lượng neutron từ dữ liệu lá dò (Au).
- Thông lượng neutron được sử dụng để tính nồng độ các nguyên tố trong mẫu.

---

## 6. CÔNG THỨC TÍNH HỒI QUY TUYẾN TÍNH (Linear Regression)

### 6.1. Phương trình hồi quy

**Công thức:**
```
y = a·x + b
```

**Trong đó:**
```
a = (Σ(xy) - n·x̄·ȳ) / (Σ(x²) - n·x̄²)
b = ȳ - a·x̄
```

**Ký hiệu:**
- **y**: Biến phụ thuộc (ví dụ: Aₛₚ hoặc thông lượng neutron)
- **x**: Biến độc lập (ví dụ: vị trí trong container)
- **a**: Hệ số góc (slope)
- **b**: Hệ số chặn (intercept)
- **n**: Số lượng điểm dữ liệu
- **x̄**: Giá trị trung bình của x
- **ȳ**: Giá trị trung bình của y
- **Σ(xy)**: Tổng của tích x·y
- **Σ(x²)**: Tổng của bình phương x

---

### 6.2. Hệ số xác định R²

**Công thức:**
```
R² = 1 - (SS_res / SS_tot)
```

**Trong đó:**
```
SS_res = Σ(yᵢ - ŷᵢ)²
SS_tot = Σ(yᵢ - ȳ)²
```

**Ký hiệu:**
- **R²**: Hệ số xác định (coefficient of determination)
- **SS_res**: Tổng bình phương phần dư (sum of squares of residuals)
- **SS_tot**: Tổng bình phương toàn phần (total sum of squares)
- **yᵢ**: Giá trị thực tế của điểm thứ i
- **ŷᵢ**: Giá trị dự đoán của điểm thứ i (từ phương trình hồi quy)
- **ȳ**: Giá trị trung bình của y

**Ghi chú:** 
- R² nằm trong khoảng 0 đến 1.
- R² càng gần 1, mô hình hồi quy càng phù hợp với dữ liệu.

---

### 6.3. Tính Aₛₚ từ vị trí trong container

**Công thức:**
```
Aₛₚ = a · position + b
```

**Ký hiệu:**
- **Aₛₚ**: Hoạt độ chuẩn hóa của lá dò tại vị trí (counts·s⁻¹·g⁻¹)
- **a**: Hệ số góc từ hồi quy tuyến tính Aₛₚ theo vị trí
- **b**: Hệ số chặn từ hồi quy tuyến tính Aₛₚ theo vị trí
- **position**: Vị trí trong container (số thực, có thể âm hoặc dương)

**Ghi chú:** 
- Công thức này được sử dụng để tính Aₛₚ cho các mẫu không phải lá dò dựa trên vị trí của chúng trong container.
- Hệ số a và b được tính từ dữ liệu của các lá dò.

---

## 7. CÔNG THỨC TÍNH NỒNG ĐỘ NGUYÊN TỐ (Concentration) - Phương pháp K₀

**Công thức:**
```
C = ((((Diện_tích_đỉnh / Thời_gian_đo) / (S(m) · D(m) · C(m) · Khối_lượng)) / Aₛₚ) · (1 / K₀) · Ratio) · 10⁶
```

**Trong đó:**
```
Ratio = ((Gth,(m) · f + Ge,(m) · Q₀(a)_lá_dò) · εp,(a)_lá_dò) / ((Gth,(m) · f + Ge,(m) · Q₀(a)_nguyên_tố) · εp,(a)_nguyên_tố)
```

**Ký hiệu:**
- **C**: Nồng độ nguyên tố trong mẫu (ppm hoặc µg/g)
- **Diện_tích_đỉnh**: Diện tích đỉnh phổ của nguyên tố (counts)
- **Thời_gian_đo**: Thời gian đo phổ (giây)
- **S(m)**: Hệ số bão hòa của nguyên tố (không thứ nguyên)
- **D(m)**: Hệ số phân rã của nguyên tố (không thứ nguyên)
- **C(m)**: Hệ số đo của nguyên tố (không thứ nguyên)
- **Khối_lượng**: Khối lượng mẫu (gram)
- **Aₛₚ**: Hoạt độ chuẩn hóa của lá dò tại vị trí mẫu (counts·s⁻¹·g⁻¹)
- **K₀**: Hằng số K₀ của nguyên tố (từ dữ liệu hạt nhân)
- **Gth,(m)**: Hệ số hình học thermal (mặc định: 1)
- **Ge,(m)**: Hệ số hình học epithermal (mặc định: 1)
- **f**: Tỷ số thông lượng epithermal/thermal (không thứ nguyên)
- **Q₀(a)_lá_dò**: Hệ số Q₀(a) của lá dò (không thứ nguyên)
- **Q₀(a)_nguyên_tố**: Hệ số Q₀(a) của nguyên tố (không thứ nguyên)
- **εp,(a)_lá_dò**: Hiệu suất đỉnh tại năng lượng a của lá dò (không thứ nguyên)
- **εp,(a)_nguyên_tố**: Hiệu suất đỉnh tại năng lượng a của nguyên tố (không thứ nguyên)
- **10⁶**: Hệ số chuyển đổi sang đơn vị ppm (parts per million)

**Ghi chú:** 
- Đây là công thức tính nồng độ theo phương pháp K₀ (K-zero method).
- Công thức được chia thành 4 phần:
  1. **Part 1**: (Diện_tích_đỉnh / Thời_gian_đo) / (S(m) · D(m) · C(m) · Khối_lượng)
  2. **Part 2**: Part 1 / Aₛₚ
  3. **Part 3**: Part 2 · (1 / K₀)
  4. **Part 4**: Ratio (tỷ số hiệu chỉnh)
- Kết quả cuối cùng = Part 3 · Part 4 · 10⁶

---

## 8. CÔNG THỨC TÍNH NỒNG ĐỘ TƯƠNG ĐỐI (Relative Concentration)

**Công thức:**
```
C_relative = (Term_mẫu / Term_chuẩn) · (Aₛₚ_chuẩn / Aₛₚ_mẫu)
```

**Trong đó:**
```
Term_mẫu = (Diện_tích_đỉnh_mẫu / Thời_gian_đo_mẫu) / (D(m)_mẫu · C(m)_mẫu · Khối_lượng_mẫu · 1000)
Term_chuẩn = (Diện_tích_đỉnh_chuẩn / Thời_gian_đo_chuẩn) / (D(m)_chuẩn · C(m)_chuẩn · Khối_lượng_chuẩn · 1000 · Nồng_độ_chuẩn)
```

**Ký hiệu:**
- **C_relative**: Nồng độ tương đối của nguyên tố trong mẫu (ppm)
- **Term_mẫu**: Số hạng tính toán cho mẫu
- **Term_chuẩn**: Số hạng tính toán cho mẫu chuẩn
- **Diện_tích_đỉnh_mẫu**: Diện tích đỉnh phổ của nguyên tố trong mẫu (counts)
- **Diện_tích_đỉnh_chuẩn**: Diện tích đỉnh phổ của nguyên tố trong mẫu chuẩn (counts)
- **Thời_gian_đo_mẫu**: Thời gian đo phổ mẫu (giây)
- **Thời_gian_đo_chuẩn**: Thời gian đo phổ mẫu chuẩn (giây)
- **D(m)_mẫu**: Hệ số phân rã của nguyên tố trong mẫu (không thứ nguyên)
- **D(m)_chuẩn**: Hệ số phân rã của nguyên tố trong mẫu chuẩn (không thứ nguyên)
- **C(m)_mẫu**: Hệ số đo của nguyên tố trong mẫu (không thứ nguyên)
- **C(m)_chuẩn**: Hệ số đo của nguyên tố trong mẫu chuẩn (không thứ nguyên)
- **Khối_lượng_mẫu**: Khối lượng mẫu (gram)
- **Khối_lượng_chuẩn**: Khối lượng mẫu chuẩn (gram)
- **Nồng_độ_chuẩn**: Nồng độ đã biết của nguyên tố trong mẫu chuẩn (ppm)
- **Aₛₚ_mẫu**: Hoạt độ chuẩn hóa của lá dò tại vị trí mẫu (counts·s⁻¹·g⁻¹)
- **Aₛₚ_chuẩn**: Hoạt độ chuẩn hóa của lá dò tại vị trí mẫu chuẩn (counts·s⁻¹·g⁻¹)
- **1000**: Hệ số chuyển đổi đơn vị

**Ghi chú:** 
- Công thức này được sử dụng khi có mẫu chuẩn tham chiếu.
- Điều kiện: Mẫu và mẫu chuẩn phải được đo ở cùng vị trí.
- Phương pháp này không cần biết K₀ và các tham số khác, chỉ cần so sánh với mẫu chuẩn.

---

## 9. CÁC HẰNG SỐ VÀ GIÁ TRỊ MẶC ĐỊNH

### 9.1. Hằng số vật lý

- **ln(2)**: Logarit tự nhiên của 2 ≈ 0.693147
- **Số Avogadro**: 6.023·10²³ mol⁻¹
- **Khối lượng nguyên tử Au**: 197 amu
- **Tiết diện bắt neutron của Au**: 98.65·10⁻²⁴ cm²

### 9.2. Giá trị mặc định cho lá dò (Au)

- **Q₀ (Au)**: 15.7
- **Er(a) (Au)**: 5.65 keV
- **Ecd(a)**: 0.55 keV

### 9.3. Hệ số mặc định

- **Gth,(m)**: 1 (hệ số hình học thermal)
- **Ge,(m)**: 1 (hệ số hình học epithermal)

---

## 10. CÁC ĐƠN VỊ SỬ DỤNG

- **Năng lượng**: keV (kiloelectronvolt)
- **Thời gian**: giây (s)
- **Khối lượng**: gram (g)
- **Nồng độ**: ppm (parts per million) hoặc µg/g
- **Thông lượng neutron**: n·cm⁻²·s⁻¹ (neutron per square centimeter per second)
- **Diện tích đỉnh**: counts (số đếm)
- **Hiệu suất**: không thứ nguyên (dimensionless)

---

## 11. GHI CHÚ QUAN TRỌNG

1. **Độ chính xác**: Tất cả các công thức được tính với độ chính xác cao, sử dụng số thực dấu phẩy động kép (double precision).

2. **Xử lý lỗi**: 
   - Kiểm tra chia cho 0 trước khi thực hiện phép chia.
   - Kiểm tra giá trị null/undefined trước khi tính toán.
   - Xử lý các trường hợp ngoại lệ (exception handling).

3. **Điều kiện tính toán**:
   - Tất cả các tham số đầu vào phải hợp lệ (không null, không NaN, không âm khi cần).
   - Thời gian đo phải lớn hơn 0.
   - Khối lượng mẫu phải lớn hơn 0.
   - Chu kỳ bán rã phải lớn hơn 0.

4. **Phương pháp tính**:
   - Phương pháp K₀: Sử dụng hằng số K₀ và so sánh với lá dò.
   - Phương pháp tương đối: So sánh trực tiếp với mẫu chuẩn.

---

## 12. TÀI LIỆU THAM KHẢO

Các công thức trong tài liệu này được dựa trên:
- Phương pháp phân tích kích hoạt neutron K₀ (K-zero method)
- Các tiêu chuẩn quốc tế về phân tích kích hoạt neutron
- Tài liệu kỹ thuật về detector gamma và hiệu suất detector

---

**Ngày tạo:** 11/12/2025
**Phiên bản:** 1.0
**Phần mềm:** NAA-K0

