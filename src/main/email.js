const nodemailer = require('nodemailer')
const config = require('./config')
const logger = require('./logger')
const { exec } = require('child_process')

async function send(to, subject, body) {
  const cfg = config.load()
  if (!cfg.smtpHost || !cfg.smtpUser || !cfg.smtpPass || !cfg.smtpFrom)
    return { success: false, message: 'SMTP no configurado. Configúralo en Ajustes > Correo' }

  const transporter = nodemailer.createTransport({
    host: cfg.smtpHost,
    port: cfg.smtpPort || 587,
    secure: cfg.smtpPort === 465,
    auth: { user: cfg.smtpUser, pass: cfg.smtpPass },
    tls: { rejectUnauthorized: false },
  })

  try {
    await transporter.sendMail({ from: cfg.smtpFrom, to, subject, text: body })
    logger.info(`Email sent to ${to}: "${subject}"`)
    return { success: true, message: `Correo enviado a ${to}` }
  } catch (e) {
    logger.error('Email send failed:', e.message)
    return { success: false, message: `Error al enviar correo: ${e.message}` }
  }
}

function compose(subject, body) {
  const s = subject ? subject.replace(/'/g, "''") : ''
  const b = body ? body.replace(/'/g, "''") : ''
  const gmUrl = `https://mail.google.com/mail/u/0/#compose${s ? '?su=' + encodeURIComponent(subject) : ''}${b ? '&body=' + encodeURIComponent(body) : ''}`
  const ps = `try {
    $o = New-Object -ComObject Outlook.Application -ErrorAction Stop
    $m = $o.CreateItem(0)
    ${s ? "  $m.Subject = '" + s + "'" : ''}
    ${b ? "  $m.HTMLBody = '<body>" + b.replace(/\n/g, '<br>') + "</body>'" : ''}
    $m.Display()
  } catch {
    Start-Process "${gmUrl}"
  }`
  return new Promise((resolve) => {
    exec(ps, { shell: 'powershell', timeout: 10000 }, (err) => {
      if (err) {
        logger.error('Compose email PS failed:', err.message)
        resolve({ success: false, message: 'No pude abrir el editor de correo' })
      } else {
        resolve({ success: true, message: 'Abriendo redacción de correo' })
      }
    })
  })
}

module.exports = { send, compose }
