-- Delete orders that do NOT belong to '株式会社マルキン海産'
DELETE FROM orders 
WHERE company_id NOT IN (
    SELECT id FROM companies WHERE name = '株式会社マルキン海産'
);
