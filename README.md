<div align="center">

  <h1>⚙️ ExamGen PRO - Core Processing Engine & API Service</h1>
  <h3>Hệ thống Xử lý Phân tích Cú pháp XML & Hoán vị Đề thi Chuẩn Bộ GD&ĐT 2025</h3>

  <p>
    Lõi xử lý nghiệp vụ backend chuyên sâu, cung cấp RESTful API phân tích cấu trúc tài liệu OpenXML (.docx), 
    nhận diện công thức toán học và hình ảnh, hoán vị khoa học câu hỏi & đáp án, tự động căn tab Smart Layout 4-2-1 
    và đóng gói luồng nén file ZIP kèm bảng ma trận Excel chấm thi.
  </p>

  <p>
    <img src="https://img.shields.io/badge/NestJS-11.0.1-E0234E?logo=nestjs" alt="NestJS">
    <img src="https://img.shields.io/badge/TypeScript-5.7.3-3178C6?logo=typescript" alt="TypeScript">
    <img src="https://img.shields.io/badge/Express-5.0.0-black?logo=express" alt="Express">
    <img src="https://img.shields.io/badge/license-UNLICENSED-red" alt="License">
    <img src="https://img.shields.io/badge/status-Active_Development-success" alt="Status">
  </p>

</div>

<br />

# ⚙️ BACKEND API SERVICE & XML PARSING CORE

Đây là Repository chứa mã nguồn **Backend** của hệ thống **ExamGen PRO**, đóng vai trò là hạt nhân thuật toán chịu trách nhiệm bóc tách, tái cấu trúc văn bản XML, quản lý logic hoán vị và xuất bản tài liệu thi cử chuẩn mực.

---

## 🛠️ Công nghệ & Phiên bản

Dựa trên cấu hình `package.json` của dự án:

### 🏗️ Core Stack

| Công nghệ | Phiên bản | Vai trò |
| :--- | :--- | :--- |
| **[NestJS](https://nestjs.com/)** | `^11.0.1` | Framework Node.js kiến trúc Modular, Dependency Injection mạnh mẽ |
| **[TypeScript](https://www.typescriptlang.org/)** | `^5.7.3` | Ngôn ngữ lập trình chính, hỗ trợ Type Safety toàn diện |
| **[@nestjs/platform-express](https://expressjs.com/)** | `^11.0.1` | Adapter HTTP nền tảng Express cho NestJS |
| **[@nestjs/config](https://docs.nestjs.com/techniques/configuration)** | `^4.0.3` | Quản lý cấu hình biến môi trường (`.env`) |
| **[Multer](https://github.com/expressjs/multer)** | `^2.0.0` | Middleware nhận diện và nạp tệp đa phần (multipart/form-data) trực tiếp vào RAM |

---

### 📄 OpenXML & Tài liệu Xử lý Chuyên sâu

| Thư viện | Phiên bản | Vai trò |
| :--- | :--- | :--- |
| **[@xmldom/xmldom](https://github.com/xmldom/xmldom)** | `^0.8.11` | Phân tích và thao tác cây DOM XML (`word/document.xml`) thuần bộ nhớ |
| **[adm-zip](https://github.com/cthackers/adm-zip)** | `^0.5.16` | Giải nén và biên soạn lại cấu trúc gói lưu trữ file Word `.docx` gốc |
| **[archiver](https://github.com/archiverjs/node-archiver)** | `^7.0.1` | Đóng gói luồng nén file ZIP `application/zip` (level 9) trả về trực tiếp qua Stream |
| **[exceljs](https://github.com/exceljs/exceljs)** | `^4.4.0` | Khởi tạo bảng tính Excel ma trận đáp án `.xlsx` định dạng chuyên nghiệp |

---

### 🧪 Chất lượng Mã nguồn & Kiểm thử (Testing)

| Thư viện | Phiên bản | Vai trò |
| :--- | :--- | :--- |
| **[Jest](https://jestjs.io/)** | `^30.0.0` | Framework chạy Unit Test và Integration Test |
| **[ts-jest](https://kulshekhar.github.io/ts-jest/)** | `^29.2.5` | TypeScript preprocessor cho Jest |
| **[ESLint](https://eslint.org/)** | `^9.18.0` | Phân tích tĩnh và phát hiện lỗi cú pháp |
| **[Prettier](https://prettier.io/)** | `^3.4.2` | Định dạng chuẩn hóa code nhất quán |

---

## 🌟 Tính năng Nghiệp vụ & Thuật toán Cốt lõi

### 1️⃣ Trích xuất Cú pháp OpenXML Sâu
* Phân tích trực tiếp các thẻ đoạn văn `<w:p>`, thẻ run `<w:r>`, thẻ văn bản `<w:t>` và thuộc tính màu sắc `<w:color>`, gạch chân `<w:u>`.
* **Bảo toàn 100% công thức Toán & Hình vẽ:** Giữ nguyên các node công thức MathType/OMML (`<m:oMath>`), biểu thức khoa học và đối tượng hình ảnh vẽ đồ thị (`<w:drawing>`).

### 2️⃣ Hỗ trợ Chuẩn Cấu trúc Đề thi Mới (Bộ GD&ĐT 2025)
* **Phần I (Trắc nghiệm nhiều lựa chọn):** Nhận diện từ khóa `Câu X.` hoặc `Question X:`, phân tích 4 phương án `A. B. C. D.` (kèm dấu chấm).
* **Phần II (Trắc nghiệm Đúng/Sai):** Tự động bóc tách 4 nhận định con `a) b) c) d)` dưới mỗi câu hỏi.
* **Phần III (Trả lời ngắn / Tự luận điền số):** Tự động trích xuất đáp án duy nhất đứng sau tiền tố `A.`.

### 3️⃣ Nhận diện Đáp án Đúng Đa Phương Thức
* Nhận diện qua mã màu chữ: **Đỏ** (`#FF0000`, `#C00000`), **Xanh lá cây** (`#00B050`, `#008000`), **Xanh dương** (`#0000FF`, `#0070C0`).
* Nhận diện qua thuộc tính gạch chân (Underline `Ctrl + U`).

### 4️⃣ Thuật toán Tách Đáp án Cùng Dòng Thông Minh (`splitAnswerParts`)
* Phân tách chính xác các đáp án nằm trên cùng 1 dòng văn bản (ngăn cách bằng phím Tab hoặc khoảng trắng).
* Khắc phục triệt để lỗi đáp án có đuôi vô tình trùng chữ cái đầu (ví dụ: các hợp chất sinh học `3-PGA.`, `RuBP.`, `OAA.`), đảm bảo không cắt nhầm nội dung phương án.

### 5️⃣ Shuffler Engine & Kiểm soát Hoán vị
* Thuật toán tráo đổi Fisher-Yates khoa học, cân đối vị trí xuất hiện của các phương án.
* **Thẻ điều khiển nhóm `<gX>`:**
  * `<g3>`: Trộn toàn bộ câu hỏi và đáp án (Mặc định).
  * `<g2>`: Giữ nguyên thứ tự câu hỏi, chỉ trộn đáp án (Dành cho bài Đọc hiểu).
  * `<g1>`: Chỉ tráo câu hỏi, giữ nguyên thứ tự đáp án.
  * `<g0>`: Đóng băng hoàn toàn (Dành cho bài nghe Audio).
* **Tính năng Ghim cố định `#`:** Đặt ký hiệu `#` trước chữ cái đáp án (ví dụ `#D. Cả A và B đều đúng`) để đáp án này luôn cố định ở vị trí ban đầu.

### 6️⃣ Cơ chế Phân phối Round-Robin Nhiều Đề Gốc
* Cho phép upload đồng thời nhiều file đề thi Word khác nhau.
* Tự động chia đều số lượng đề con cần trộn cho từng nguồn đề gốc, hạn chế trùng lặp đề thi trong phòng thi.

### 7️⃣ Dàn Trang Tự Động Smart Layout 4-2-1
* Tự động tính toán độ dài phương án trả lời để chèn điểm dừng Tab Stop chuẩn:
  * Phương án ngắn: Xếp **4 đáp án / 1 dòng**.
  * Phương án vừa: Xếp **2 đáp án / 1 dòng**.
  * Phương án dài: Xếp **1 đáp án / 1 dòng**.
* Giúp văn bản thẳng hàng, thẩm mỹ và tiết kiệm đến 40% chi phí giấy in.

### 8️⃣ Xuất Ma Trận Excel Tự Động & Tiêu Đề Tàng Hình
* Khởi tạo file Excel `.xlsx` đối chiếu ma trận đáp án giữa các mã đề, tương thích với máy quét và các ứng dụng chấm trắc nghiệm.
* Tự động chèn bảng tiêu đề Sở GD / Trường học 2 cột với đường viền vô hình chuẩn quy cách Bộ Giáo Dục.

---

## 📚 Danh sách API Endpoints

Tất cả các route được quản trị theo tiền tố `/api/v1/exams`:

### 1. Xem trước ma trận & Kiểm tra lỗi định dạng
* **Method:** `POST`
* **URL:** `/api/v1/exams/preview`
* **Content-Type:** `multipart/form-data`
* **Parameters:**
  * `files`: Danh sách 1 hoặc nhiều file Word (`.docx`).
  * `numExams`: Số lượng mã đề cần tạo (mặc định: `4`).
  * `startCode`: Mã đề bắt đầu (mặc định: `101`).
  * `startQuestion`: Câu số bắt đầu (mặc định: `1`).
* **Response:**
  ```json
  {
    "success": true,
    "matrix": [["A", "B", "C", "D"], ["B", "C", "D", "A"]],
    "previewExam": [
      {
        "question": "Câu 1. Thủ đô của Việt Nam là gì?",
        "answers": ["A. Hà Nội", "B. Huế", "C. Đà Nẵng", "D. TP.HCM"],
        "correctAnswer": "A"
      }
    ]
  }
  ```
  *(Trường hợp phát hiện lỗi định dạng: trả về `success: false` kèm mảng `errors` chi tiết từng câu và hướng dẫn khắc phục).*

### 2. Trộn đề thi và Xuất file nén ZIP
* **Method:** `POST`
* **URL:** `/api/v1/exams/mix-multi`
* **Content-Type:** `multipart/form-data`
* **Parameters bổ sung:**
  * `useHeader`: Bật/tắt tiêu đề trường (`true` | `false`).
  * `useFooter`: Bật/tắt chữ HẾT ở cuối trang (`true` | `false`).
  * `department`: Tên Sở / Phòng GD&ĐT.
  * `school`: Tên Trường / Đơn vị.
  * `examName`: Tên kì kiểm tra.
  * `schoolYear`: Năm học.
  * `subject`: Tên môn thi.
  * `duration`: Thời gian làm bài.
* **Response:** Tải về trực tiếp tệp nén `Bo_De_Thi.zip` (chứa các file `.docx` đã trộn và file Excel ma trận đáp án).

---

## 🚀 Cài đặt & Khởi chạy

### 1️⃣ Yêu cầu hệ thống (Prerequisites)

* **Node.js:** `>= 20.0.0` (Khuyến nghị **Node.js 20.x** hoặc **22.x LTS**)
* **Package Manager:** `npm` (>= 9), `yarn` hoặc `pnpm`

### 2️⃣ Clone Repository & Cài đặt Dependencies

```bash
git clone https://github.com/hvt299/Exam-Generator-Backend.git
cd Exam-Generator-Backend
npm install
```

### 3️⃣ Cấu hình biến môi trường (.env)

Tạo file `.env` tại thư mục gốc:

```env
PORT=3001
```

### 4️⃣ Các lệnh thực thi (NPM Scripts)

```bash
# Khởi chạy môi trường phát triển (Watch mode - Hot reload)
npm run start:dev

# Biên dịch dự án ra mã JavaScript thuần (dist/)
npm run build

# Khởi chạy bản production
npm run start:prod
```

### 5️⃣ Chạy Kiểm thử Tự động (Testing)

```bash
# Chạy bộ Unit Tests
npm run test

# Chạy kiểm thử theo dõi liên tục
npm run test:watch

# Xuất báo cáo độ bao phủ mã nguồn (Coverage Report)
npm run test:cov
```

---

## 📂 Cấu trúc Thư mục Dự án

```text
Exam-Generator-Backend/
├── src/
│   ├── docx-parser/
│   │   ├── docx-parser.controller.spec.ts   # Unit test cho Controller
│   │   ├── docx-parser.controller.ts        # Tiếp nhận HTTP request & Upload stream
│   │   ├── docx-parser.module.ts            # Khai báo Module xử lý DOCX
│   │   ├── docx-parser.service.spec.ts       # Unit test bóc tách thuật toán
│   │   └── docx-parser.service.ts           # Trọng tâm thuật toán XML & hoán vị
│   ├── app.controller.spec.ts
│   ├── app.controller.ts
│   ├── app.module.ts                        # Module gốc khởi chạy ứng dụng
│   ├── app.service.ts
│   └── main.ts                              # Entry point cấu hình CORS & Port 3001
├── test/                                    # Cấu hình End-to-End tests
├── .env                                     # File biến môi trường
├── package.json
└── tsconfig.json
```

---

## 🔗 Kết nối Frontend Dashboard

API Service này được thiết kế để kết nối trực tiếp với **ExamGen PRO Frontend Web** (chạy tại cổng `3000`):
* Cấu hình CORS đã được mở mặc định trong `src/main.ts` (`app.enableCors()`).
* Đảm bảo cấu hình biến môi trường trên Frontend: `NEXT_PUBLIC_API_URL=http://localhost:3001`.

---

## 👨‍💻 Tác giả

Phát triển bởi **Mr.T (hvt299)**  
GitHub: [https://github.com/hvt299](https://github.com/hvt299)
