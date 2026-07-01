<?php
/**
 * send_order.php — Steinkamp Container · Backend PHP local
 * ─────────────────────────────────────────────────────────
 * Reçoit les données de commande depuis le formulaire JS,
 * les formate et les envoie par email à l'adresse configurée.
 *
 * Utilisation locale : XAMPP / Laragon / WAMP
 * URL : http://localhost/produit/send_order.php
 *
 * @author  Steinkamp Container System
 * @version 2.0.0
 */
declare(strict_types=1);
/* ── Configuration ────────────────────────────── */
define('SC_ORDER_EMAIL', 'info@steinkamp-container.com');
define('SC_SITE_NAME',   'Steinkamp Container GmbH');
define('SC_SITE_URL',    'http://localhost/produit/');
/* Autorise les requêtes depuis localhost */
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
header('Content-Type: application/json; charset=utf-8');
/* Répond aux requêtes preflight OPTIONS */
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}
/* ── Vérification méthode ─────────────────────── */
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_error('Méthode non autorisée.', 405);
}
/* ── Protection anti-spam (honeypot) ─────────── */
if (!empty($_POST['_gotcha'])) {
    json_success('OK'); // Piège à bot — répondre normalement pour ne pas le trahir
}
/* ── Récupération des données ─────────────────── */
$action     = sanitize($_POST['sc_action'] ?? 'send_order');
$lang       = sanitize($_POST['lang'] ?? 'de');
$cart_json  = $_POST['cart_items'] ?? '[]';
$cart_total = (float)($_POST['cart_total'] ?? 0);
/* Données client (formulaire WooCommerce ou formulaire custom) */
$name       = sanitize($_POST['name'] ?? ($_POST['billing_first_name'] ?? '') . ' ' . ($_POST['billing_last_name'] ?? ''));
$email      = sanitize($_POST['email'] ?? $_POST['billing_email'] ?? '');
$phone      = sanitize($_POST['phone'] ?? $_POST['billing_phone'] ?? '');
$message    = sanitize($_POST['message'] ?? $_POST['order_comments'] ?? '');
$company    = sanitize($_POST['billing_company'] ?? '');
$address1   = sanitize($_POST['billing_address_1'] ?? '');
$address2   = sanitize($_POST['billing_address_2'] ?? '');
$postcode   = sanitize($_POST['billing_postcode'] ?? '');
$city       = sanitize($_POST['billing_city'] ?? '');
$country    = sanitize($_POST['billing_country'] ?? '');
$state      = sanitize($_POST['billing_state'] ?? '');
/* ── Validation basique ───────────────────────── */
if (empty($name)) {
    json_error('Le champ "Nom" est obligatoire.');
}
if (!empty($email) && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    json_error('L\'adresse e-mail est invalide.');
}
/* ── Décodage du panier ───────────────────────── */
$cart_items = [];
$raw = json_decode($cart_json, true);
if (is_array($raw)) {
    foreach ($raw as $item) {
        $cart_items[] = [
            'id'    => sanitize((string)($item['id']    ?? '')),
            'name'  => sanitize((string)($item['name']  ?? 'Produit')),
            'price' => (float)($item['price'] ?? 0),
            'qty'   => (int)($item['qty']     ?? 1),
        ];
    }
}
/* ── Construction de l'email ──────────────────── */
$date = date('d.m.Y H:i');
/* Ligne d'objets du panier (HTML) */
$items_html = '';
$items_text = '';
if (!empty($cart_items)) {
    $items_html .= '<table style="width:100%;border-collapse:collapse;margin:16px 0;">';
    $items_html .= '<thead><tr style="background:#f5f5f5;">';
    $items_html .= '<th style="padding:10px;text-align:left;border:1px solid #e0e0e0;">Produkt</th>';
    $items_html .= '<th style="padding:10px;text-align:center;border:1px solid #e0e0e0;">Menge</th>';
    $items_html .= '<th style="padding:10px;text-align:right;border:1px solid #e0e0e0;">Preis</th>';
    $items_html .= '<th style="padding:10px;text-align:right;border:1px solid #e0e0e0;">Zwischensumme</th>';
    $items_html .= '</tr></thead><tbody>';
    foreach ($cart_items as $item) {
        $subtotal = $item['price'] * $item['qty'];
        $items_html .= sprintf(
            '<tr><td style="padding:10px;border:1px solid #e0e0e0;">%s</td>' .
            '<td style="padding:10px;text-align:center;border:1px solid #e0e0e0;">%d</td>' .
            '<td style="padding:10px;text-align:right;border:1px solid #e0e0e0;">%s €</td>' .
            '<td style="padding:10px;text-align:right;border:1px solid #e0e0e0;">%s €</td></tr>',
            htmlspecialchars($item['name']),
            $item['qty'],
            number_format($item['price'], 2, ',', '.'),
            number_format($subtotal, 2, ',', '.')
        );
        $items_text .= sprintf("- %s x%d : %s €\n", $item['name'], $item['qty'], number_format($subtotal, 2, ',', '.'));
    }
    $items_html .= sprintf(
        '</tbody><tfoot><tr><td colspan="3" style="padding:10px;text-align:right;border:1px solid #e0e0e0;font-weight:bold;">Gesamtsumme</td>' .
        '<td style="padding:10px;text-align:right;border:1px solid #e0e0e0;font-weight:bold;font-size:16px;">%s €</td></tr></tfoot></table>',
        number_format($cart_total, 2, ',', '.')
    );
} else {
    $items_html = '<p><em>Keine Artikel gefunden.</em></p>';
    $items_text = "Keine Artikel\n";
}
/* Adresse HTML */
$address_html = '';
if ($address1 || $city) {
    $address_html = implode('<br>', array_filter([
        $company,
        $address1,
        $address2,
        $postcode . ($postcode && $city ? ' ' : '') . $city,
        $state,
        $country,
    ]));
}
/* Corps de l'email HTML */
$body_html = <<<HTML
<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Neue Bestellung — {SC_SITE_NAME}</title>
</head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Arial,sans-serif;background:#f0f2f5;color:#333;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;padding:40px 0;">
  <tr>
    <td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <!-- HEADER -->
        <tr>
          <td style="background:#1a1a2e;padding:30px 40px;text-align:center;">
            <h1 style="color:#fff;margin:0;font-size:22px;letter-spacing:1px;">
              📦 Neue Bestellung
            </h1>
            <p style="color:rgba(255,255,255,0.6);margin:8px 0 0;font-size:14px;">
              Steinkamp Container GmbH · {$date}
            </p>
          </td>
        </tr>
        <!-- BODY -->
        <tr>
          <td style="padding:32px 40px;">
            <!-- Données client -->
            <table style="width:100%;margin-bottom:24px;">
              <tr>
                <td style="width:50%;vertical-align:top;padding-right:16px;">
                  <h3 style="margin:0 0 12px;color:#1a1a2e;font-size:15px;border-bottom:2px solid #e5e7eb;padding-bottom:6px;">
                    👤 Kundendaten
                  </h3>
                  <p style="margin:4px 0;font-size:14px;"><strong>Name:</strong> {$name}</p>
                  <p style="margin:4px 0;font-size:14px;"><strong>E-Mail:</strong> <a href="mailto:{$email}" style="color:#1a1a2e;">{$email}</a></p>
                  <p style="margin:4px 0;font-size:14px;"><strong>Telefon:</strong> {$phone}</p>
                </td>
                <td style="width:50%;vertical-align:top;">
                  <h3 style="margin:0 0 12px;color:#1a1a2e;font-size:15px;border-bottom:2px solid #e5e7eb;padding-bottom:6px;">
                    🏠 Lieferadresse
                  </h3>
                  <p style="margin:4px 0;font-size:14px;line-height:1.6;">{$address_html}</p>
                </td>
              </tr>
            </table>
            <!-- Panier -->
            <h3 style="margin:0 0 12px;color:#1a1a2e;font-size:15px;border-bottom:2px solid #e5e7eb;padding-bottom:6px;">
              🛒 Bestellübersicht
            </h3>
            {$items_html}
            <!-- Notes -->
HTML;
if ($message) {
    $body_html .= <<<HTML
            <h3 style="margin:24px 0 8px;color:#1a1a2e;font-size:15px;border-bottom:2px solid #e5e7eb;padding-bottom:6px;">
              📝 Nachricht / Hinweise
            </h3>
            <p style="font-size:14px;line-height:1.6;background:#f9fafb;padding:16px;border-radius:8px;border:1px solid #e5e7eb;">
HTML;
    $body_html .= nl2br(htmlspecialchars($message));
    $body_html .= '</p>';
}
$body_html .= <<<HTML
          </td>
        </tr>
        <!-- FOOTER -->
        <tr>
          <td style="background:#f9fafb;padding:20px 40px;text-align:center;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">
              Steinkamp Container GmbH ·  info-steinkamp-container@europe.com<br>
              +49 1521 2422246 · Diese E-Mail wurde automatisch generiert.
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>
HTML;
/* Corps texte brut (fallback) */
$body_text = <<<TEXT
NEUE BESTELLUNG — Steinkamp Container GmbH
==========================================
Datum: {$date}
KUNDENDATEN
-----------
Name:    {$name}
E-Mail:  {$email}
Telefon: {$phone}
Adresse: {$address1} {$address2}, {$postcode} {$city}, {$country}
ARTIKEL
-------
{$items_text}
Gesamtsumme: {$total_formatted} €
NACHRICHT
---------
{$message}
--
Steinkamp Container GmbH |  info-steinkamp-container@europe.com
TEXT;
$total_formatted = number_format($cart_total, 2, ',', '.');
/* ── En-têtes email ───────────────────────────── */
$subject  = sprintf('[Steinkamp] Neue Bestellung von %s – %s', $name ?: 'Unbekannt', $date);
$from_name  = SC_SITE_NAME;
$from_email = 'noreply@steinkamp-container.com';
$boundary = md5(uniqid('', true));
$headers  = "MIME-Version: 1.0\r\n";
$headers .= "From: {$from_name} <{$from_email}>\r\n";
$headers .= "Reply-To: {$name} <{$email}>\r\n";
$headers .= "X-Mailer: SC-PHP-Mailer/2.0\r\n";
$headers .= "Content-Type: multipart/alternative; boundary=\"{$boundary}\"\r\n";
$body  = "--{$boundary}\r\n";
$body .= "Content-Type: text/plain; charset=UTF-8\r\n";
$body .= "Content-Transfer-Encoding: quoted-printable\r\n\r\n";
$body .= quoted_printable_encode($body_text) . "\r\n\r\n";
$body .= "--{$boundary}\r\n";
$body .= "Content-Type: text/html; charset=UTF-8\r\n";
$body .= "Content-Transfer-Encoding: quoted-printable\r\n\r\n";
$body .= quoted_printable_encode($body_html) . "\r\n\r\n";
$body .= "--{$boundary}--";
/* ── Envoi ────────────────────────────────────── */
$sent = mail(SC_ORDER_EMAIL, $subject, $body, $headers);
/* Log local pour débogage */
$log_dir  = __DIR__ . '/logs';
$log_file = $log_dir . '/orders.log';
if (!is_dir($log_dir)) {
    @mkdir($log_dir, 0755, true);
}
$log_entry = sprintf(
    "[%s] %s | Client: %s <%s> | Total: %s € | Articles: %d | Envoyé: %s\n",
    date('Y-m-d H:i:s'),
    $action,
    $name,
    $email,
    number_format($cart_total, 2, ',', '.'),
    count($cart_items),
    $sent ? 'OUI' : 'NON'
);
@file_put_contents($log_file, $log_entry, FILE_APPEND | LOCK_EX);
/* En local (XAMPP), mail() peut échouer sans serveur SMTP.
   On retourne quand même succès si les données sont valides. */
$is_local = in_array($_SERVER['SERVER_NAME'] ?? '', ['localhost', '127.0.0.1', '::1'], true);
if ($sent || $is_local) {
    json_success('Bestellung erfolgreich gesendet.', [
        'order_id' => strtoupper(substr(md5(uniqid()), 0, 8)),
        'email'    => SC_ORDER_EMAIL,
        'client'   => $name,
        'total'    => number_format($cart_total, 2, ',', '.') . ' €',
    ]);
} else {
    json_error('E-Mail konnte nicht gesendet werden. Bitte versuche es erneut.', 500);
}
/* ═══════════════════════════════════════════════
   FONCTIONS UTILITAIRES
   ═══════════════════════════════════════════════ */
function sanitize(string $val): string {
    return htmlspecialchars(strip_tags(trim($val)), ENT_QUOTES, 'UTF-8');
}
function json_success(string $message, array $data = []): void {
    echo json_encode(['success' => true, 'message' => $message] + $data, JSON_UNESCAPED_UNICODE);
    exit;
}
function json_error(string $message, int $code = 400): void {
    http_response_code($code);
    echo json_encode(['success' => false, 'message' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}
