// Creates a local SQLite database with FAKE, synthetic data for the SQLi demo.
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("directory.db");

db.exec(`
  DROP TABLE IF EXISTS patient_directory;
  DROP TABLE IF EXISTS staff_users;

  CREATE TABLE patient_directory (fhir_id TEXT, full_name TEXT, postcode TEXT);
  CREATE TABLE staff_users (username TEXT, password_hash TEXT, role TEXT);

  INSERT INTO patient_directory VALUES
    ('pat-001', 'Alice Test',   'AB1 2CD'),
    ('pat-002', 'Bob Sample',   'EF3 4GH'),
    ('pat-003', 'Chitra Demo',  'IJ5 6KL');

  INSERT INTO staff_users VALUES
    ('dr.fake',    'fakehash_5f4dcc3b5aa765d61d8327deb882cf99', 'clinician'),
    ('admin.fake', 'fakehash_21232f297a57a5a743894a0e4a801fc3', 'admin');
`);

console.log("directory.db created with synthetic data");