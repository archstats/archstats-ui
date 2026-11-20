package com.example.orders;

import com.example.billing.Invoice;

public class Order {
    private final String id;
    private final int total;

    public Order(String id, int total) {
        this.id = id;
        this.total = total;
    }

    public String id() { return id; }

    public int total() { return total; }

    public Invoice invoice() {
        if (total > 0) {
            for (int i = 0; i < total; i++) {
                if (i > 100) {
                    break;
                }
            }
        }
        return new Invoice(this);
    }
}
