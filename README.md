# ✈️ Chaos Knights: Flight Booking & Chaos Engineering Lab

Hệ thống mô phỏng và kiểm thử khả năng chịu lỗi (Resilience), tính nhất quán (Consistency) và kiểm soát giao dịch đồng thời (Concurrency Control) trên cơ sở dữ liệu phân tán **CockroachDB**, triển khai trong cụm **Kubernetes (Minikube)** phối hợp công cụ **Chaos Mesh**.

---

## 🚀 1. Tổng Quan Kiến Trúc Hệ Thống
* **Frontend:** React (Tailwind CSS, Lucide Icons) - Xử lý UI luồng độc lập, áp dụng cơ chế phòng thủ mạng chủ động bằng `AbortController` (Hủy request nghẽn sau 4000ms, phòng chống lỗi treo giao diện).
* **Backend:** Node.js / Express.js REST API - Kết nối trực tiếp tới Cluster phân tán, cài đặt logic xử lý tranh chấp nghiêm ngặt (`FOR UPDATE NOWAIT`) tránh deadlock diện rộng.
* **Database:** CockroachDB Cluster (3-Node StatefulSet) hoạt động ở mức cô lập cao nhất `SERIALIZABLE SNAPSHOT ISOLATION (SSI)`.
* **Môi trường:** Local Kubernetes (Minikube) + Docker Desktop.

---

## ⚙️ 2. Hướng Dẫn Cài Đặt Khởi Chạy

### Bước 2.1: Khởi động Minikube & Cấu hình Docker Env
```bash
# Khởi động cụm Minikube 
minikube start 
Bước 2.2: Triển khai Cấu trúc Database Phân tán 
Bash
# Áp dụng cấu hình StatefulSet cho CockroachDB Cluster
kubectl apply -f roach-k8s.yaml

# Khởi tạo cụm dữ liệu phân tán (Chỉ chạy 1 lần)
kubectl exec -it cockroachdb-0 -- ./cockroach init

# Đăng nhập SQL Shell để tạo database và mock data chuyến bay
kubectl exec -it cockroachdb-0 -- ./cockroach sql --insecure
# sau đó thêm database vào
docker build -t backend-service:v2 ./backend
kubectl apply -f backend-deploy.yaml
#Tiến hành Port-Forward để truy cập ứng dụng dưới máy Local
minikube service backend-service url
#Dùng url để liên kết gọi api từ frontend về backend