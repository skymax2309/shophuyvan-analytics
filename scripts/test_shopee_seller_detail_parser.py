from __future__ import annotations

import sys
from pathlib import Path


PY_AUTOMATION_ROOT = Path("E:/shophuyvan-python-automation")
sys.path.insert(0, str(PY_AUTOMATION_ROOT))

from oms_python.platforms.shopee.orders.parser_chitiet import (  # noqa: E402
    SELLER_DETAIL_SOURCE,
    normalize_detail_url,
    parse_seller_detail_text,
    seller_center_detail_id_from_url,
)


def assert_equal(actual, expected, message: str) -> None:
    if actual != expected:
        raise AssertionError(f"{message}: expected={expected!r} actual={actual!r}")


def assert_truthy(value, message: str) -> None:
    if not value:
        raise AssertionError(message)


def main() -> None:
    order_sn = "260519RWS50TA2"
    detail_url = "https://banhang.shopee.vn/portal/sale/order/232855966247234"
    body_text = """
    Shop khogiadungcona
    260519RWS50TA2
    Đã giao cho ĐVVC
    đơn đang được giao tới người mua
    SPX Express
    SPXVN067508201855
    Bộ điều khiển thông minh WiFi
    SKU phân loại: HV-SMART-01
    x 1
    Thông tin thanh toán
    Tổng doanh thu
    ₫120.000
    Phí vận chuyển người mua trả
    ₫18.000
    Phí sàn
    -₫5.000
    Thực nhận ví
    ₫97.000
    """
    detail = parse_seller_detail_text(body_text, order_sn=order_sn, detail_url=detail_url)
    assert_equal(seller_center_detail_id_from_url(order_sn), "", "không được lấy mã đơn làm detail id")
    assert_equal(seller_center_detail_id_from_url(detail_url), "232855966247234", "detail id mẫu")
    assert_equal(normalize_detail_url(detail_url), detail_url, "detail url chuẩn")
    assert_equal(detail["source"], SELLER_DETAIL_SOURCE, "source Seller Center")
    assert_equal(detail["order_sn"], order_sn, "mã đơn")
    assert_equal(detail["seller_center_detail_id"], "232855966247234", "detail id")
    assert_equal(detail["tracking_number"], "SPXVN067508201855", "mã vận đơn")
    assert_equal(detail["logistics_provider"], "SPX Express", "đơn vị vận chuyển")
    assert_equal(detail["fields"]["product_revenue_after_shop_discount"], 120000.0, "doanh thu")
    assert_equal(detail["fields"]["marketplace_fee_total"], 5000.0, "phí sàn")
    assert_equal(detail["fields"]["actual_income"], 97000.0, "thực nhận ví")
    assert_truthy(detail["items"], "phải parse được item mẫu")
    sample_order = "260520VPM23704"
    sample_url = "https://banhang.shopee.vn/portal/sale/order/232986368285700"
    sample_body = """
    Chi tiết đơn hàng
    260520VPM23704
    Thông tin vận chuyển
    Kiện hàng 1: Nhanh
    SPX Express
    # SPXVN061855241865
    Đơn vị vận chuyển lấy hàng thành công
    14:04 21/05/2026
    Mở rộng
    Thanh toán của Người Mua
    Tổng tiền sản phẩm
    ₫99.000
    Phí vận chuyển
    ₫8.000
    Shopee Voucher
    -₫21.780
    Mã giảm giá của Shop
    ₫0
    Tổng tiền Thanh toán
    ₫85.220
    Số tiền cuối cùng
    ₫70.030
    Tổng tiền sản phẩm
    ₫99.000
    Phí vận chuyển Người mua trả
    ₫8.000
    Phí vận chuyển ước tính
    -₫37.600
    Phí vận chuyển được trợ giá từ Shopee ước tính
    ₫29.600
    Mã ưu đãi Đồng Tài Trợ do Người Bán chịu - SSCBD2052
    -₫6.534
    Phụ phí
    -₫21.049
    Phí cố định
    -₫12.021
    Phí Dịch Vụ
    -₫3.000
    Phí xử lý giao dịch
    -₫6.028
    Thuế tổng
    -₫1.387
    Thuế GTGT
    -₫925
    Thuế TNCN
    -₫462
    Doanh thu đơn hàng ước tính
    ₫70.030
    """
    sample = parse_seller_detail_text(sample_body, order_sn=sample_order, detail_url=sample_url)
    assert_equal(sample["fields"]["product_revenue_after_shop_discount"], 99000.0, "Shopee product_after_discount")
    assert_equal(sample["fields"]["shipping_fee_buyer_paid"], 8000.0, "Shopee buyer shipping")
    assert_equal(sample["fields"]["platform_voucher_amount"], 21780.0, "Shopee voucher sàn")
    assert_equal(sample["fields"]["buyer_total_paid"], 85220.0, "Shopee buyer paid")
    assert_equal(sample["fields"]["seller_cofunded_voucher_amount"], 6534.0, "Shopee đồng tài trợ người bán")
    assert_equal(sample["fields"]["fixed_fee"], 12021.0, "Shopee phí cố định")
    assert_equal(sample["fields"]["service_fee"], 3000.0, "Shopee phí dịch vụ")
    assert_equal(sample["fields"]["transaction_fee"], 6028.0, "Shopee phí xử lý giao dịch")
    assert_equal(sample["fields"]["tax_vat"], 925.0, "Shopee VAT")
    assert_equal(sample["fields"]["tax_pit"], 462.0, "Shopee PIT")
    assert_equal(sample["fields"]["actual_income"], 70030.0, "Shopee settlement")
    assert_equal(sample["tracking_number"], "SPXVN061855241865", "Shopee tracking")
    assert_equal(len(sample["tracking_events"]), 1, "Shopee tracking events")
    missing_payment = parse_seller_detail_text(
        f"{order_sn}\nĐã giao cho ĐVVC\nSPXVN067508201855",
        order_sn=order_sn,
        detail_url=detail_url,
    )
    assert_equal(missing_payment["finance_detail_missing"], True, "không fake doanh thu khi thiếu thanh toán")
    try:
        parse_seller_detail_text(body_text, order_sn="260519WRONG", detail_url=detail_url)
    except ValueError as exc:
        assert_truthy("order_sn_mismatch" in str(exc), "mismatch phải bị chặn")
    else:
        raise AssertionError("mismatch không được import")
    print("test_shopee_seller_detail_parser: ok")


if __name__ == "__main__":
    main()
