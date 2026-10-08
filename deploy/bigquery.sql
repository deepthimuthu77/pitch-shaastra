CREATE SCHEMA IF NOT EXISTS `YOUR_PROJECT.pitchgrill`
OPTIONS(location='US');

CREATE TABLE IF NOT EXISTS `YOUR_PROJECT.pitchgrill.sessions` (
  session_hash STRING,
  overall_score INT64,
  difficulty STRING,
  answer_count INT64,
  created_at FLOAT64
)
OPTIONS(expiration_timestamp=TIMESTAMP_ADD(CURRENT_TIMESTAMP(), INTERVAL 30 DAY));
