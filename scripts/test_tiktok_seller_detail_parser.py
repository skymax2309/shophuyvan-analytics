from pathlib import Path
import sys

AUTO_OMS_DIR = Path(r"E:\shophuyvan-python-automation")
if str(AUTO_OMS_DIR) not in sys.path:
    sys.path.insert(0, str(AUTO_OMS_DIR))

from oms_python.platforms.tiktok.orders.parser_chitiet import (  # noqa: E402
    order_no_from_url,
    parse_seller_detail_text,
    parse_vnd_money,
)


ORDER_NO = "584098737148888997"
DETAIL_URL = f"https://seller-vn.tiktok.com/order/detail?order_no={ORDER_NO}&shop_region=VN"


def test_parser_sample():
    body = f"""
    Mã đơn hàng {ORDER_NO}
    Những gì khách hàng của bạn đã thanh toán
    Tổng các mặt hàng trước khi giảm giá
    ₫69.000
    Giảm giá của người bán cho các mặt hàng
    -₫24.000
    Giảm giá của TikTok Shop cho các mặt hàng
    ₫0
    Tổng các mặt hàng sau khi giảm giá
    ₫45.000
    Phí vận chuyển sau khi giảm giá
    ₫35.200
    Giảm phí vận chuyển của người bán
    ₫0
    Giảm phí vận chuyển của TikTok Shop
    ₫0
    Tổng cộng
    ₫80.200
    Số tiền bạn kiếm được
    Chưa có dữ liệu
    """
    parsed = parse_seller_detail_text(body, order_no=ORDER_NO, detail_url=DETAIL_URL)
    fields = parsed["fields"]
    assert order_no_from_url(DETAIL_URL) == ORDER_NO
    assert parse_vnd_money("-₫24.000") == -24000
    assert fields["product_original_amount"] == 69000
    assert fields["seller_item_discount"] == 24000
    assert fields["product_revenue_after_shop_discount"] == 45000
    assert fields["buyer_shipping_paid"] == 35200
    assert fields["gross_revenue"] == 80200
    assert fields["actual_income"] is None
    assert parsed["settlement_status"] == "pending_settlement"


def test_parser_mismatch_blocks_import():
    try:
        parse_seller_detail_text("Mã đơn hàng 123", order_no=ORDER_NO, detail_url=DETAIL_URL)
    except ValueError as exc:
        assert "header_order_no_mismatch" in str(exc)
    else:
        raise AssertionError("Parser phải chặn khi order_no URL không khớp mã trên trang")


def test_parser_real_collapsed_label_variant():
    body = f"""
    {ORDER_NO}
    Những gì khách hàng của bạn đã thanh toán
    Phương thức thanh toán
    Thanh toán khi giao hàng
    Hiển thị chi tiết
    Tổng (các) mặt hàng sau khi giảm giá
    45.000₫
    Phí vận chuyển sau khi giảm giá
    35.200₫
    Tổng cộng
    80.200₫
    Số tiền bạn kiếm được
    Thông tin không có sẵn. Làm mới trang hoặc kiểm tra sau khi đơn hàng đã giao.
    """
    parsed = parse_seller_detail_text(body, order_no=ORDER_NO, detail_url=DETAIL_URL)
    fields = parsed["fields"]
    assert fields["product_revenue_after_shop_discount"] == 45000
    assert fields["buyer_shipping_paid"] == 35200
    assert fields["gross_revenue"] == 80200
    assert fields["actual_income"] is None
    assert parsed["settlement_status"] == "pending_settlement"


def test_parser_finance_transaction_pending_settlement():
    order_no = "584123080227784403"
    finance_url = f"https://seller-vn.tiktok.com/finance/transactions?billsId=0&orderOrSkuId={order_no}&shop_region=VN&tab=to_settle_tab"
    body = f"""
    Chi tiết quyết toán
    ID đơn hàng/ID điều chỉnh:{order_no}
    Ngày tạo đơn hàng
    21/05/2026
    Trạng thái chưa thanh toán
    Đang chờ giao kiện hàng
    Doanh thu ước tính
    89.000đ
    Tổng phụ sau giảm giá của người bán
    89.000đ
    Phí ước tính
    -21.245đ
    Phí giao dịch ước tính
    -5.340đ
    Phí hoa hồng của TikTok Shop
    -11.570đ
    Phí vận chuyển ước tính của người bán
    0đ
    Phí xử lý đơn hàng
    -3.000đ
    Thuế GTGT do TikTok Shop khấu trừ
    -890đ
    Thuế TNCN do TikTok Shop khấu trừ
    -445đ
    Tổng số tiền quyết toán
    67.755đ
    """
    parsed = parse_seller_detail_text(body, order_no=order_no, detail_url=finance_url)
    fields = parsed["fields"]
    assert fields["product_revenue_after_shop_discount"] == 89000
    assert fields["estimated_fee_total"] == 21245
    assert fields["transaction_fee"] == 5340
    assert fields["commission_fee"] == 11570
    assert fields["handling_fee"] == 3000
    assert fields["tax_vat"] == 890
    assert fields["tax_pit"] == 445
    assert fields["settlement_total"] == 67755
    assert fields["estimated_income"] == 67755
    assert fields["actual_income"] is None
    assert parsed["actual_income_available"] is False
    assert parsed["settlement_status"] == "pending_settlement"
    assert parsed["finance_source"] == "tiktok_seller_center_finance_transaction"


if __name__ == "__main__":
    test_parser_sample()
    test_parser_mismatch_blocks_import()
    test_parser_real_collapsed_label_variant()
    test_parser_finance_transaction_pending_settlement()
    print("test_tiktok_seller_detail_parser: ok")
