<?php
$file = "stato.json";
if ($_SERVER["REQUEST_METHOD"] === "POST") {
  file_put_contents($file, file_get_contents("php://input"));
  echo "ok";
  exit;
}
header("Content-Type: application/json");
echo file_exists($file) ? file_get_contents($file) : "{}";
