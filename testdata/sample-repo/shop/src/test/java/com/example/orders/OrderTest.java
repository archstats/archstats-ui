package com.example.orders;

public class OrderTest {
    void totals() {
        assert new Order("a", 2).invoice().amount() == 200;
    }
}
