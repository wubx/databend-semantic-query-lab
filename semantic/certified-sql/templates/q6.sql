SELECT SUM(l_extendedprice * l_discount) AS revenue
FROM tpch_100.lineitem
WHERE l_shipdate >= DATE '{{startDate}}'
  AND l_shipdate < DATE '{{endDate}}'
  AND l_discount BETWEEN {{discountMin}} AND {{discountMax}}
  AND l_quantity < {{quantity}}
