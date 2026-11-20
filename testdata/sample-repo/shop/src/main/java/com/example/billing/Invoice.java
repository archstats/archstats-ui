package com.example.billing;

import com.example.orders.Order;

public class Invoice {
    private final Order order;

    public Invoice(Order order) {
        this.order = order;
    }

    public int amount() {
        return order.total() * 100;
    }
}
