-- VP schema 0102 (intake): attr_contact (0002) indexes the same columns as attribute_current (0101, unique).
-- Keep one: every attribute write maintained both, and a 50k-row import writes about 350k attribute rows.
DROP INDEX IF EXISTS attr_contact;
