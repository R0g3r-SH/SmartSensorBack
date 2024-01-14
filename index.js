const express = require('express');
const admin = require('firebase-admin');
const Excel = require('exceljs');
//add cors
const cors = require('cors');

require('dotenv').config()

const nodemailer = require('nodemailer');

admin.initializeApp({
    credential: admin.credential.cert({
        "type": process.env.TYPE,
        "project_id": process.env.PROJECT_ID,
        "private_key_id": process.env.PRIVATE_KEY_ID,
        "private_key": process.env.PRIVATE_KEY.replace(/\\n/g, '\n'),
        "client_email": process.env.CLIENT_EMAIL,
        "client_id": process.env.CLIENT_ID,
        "auth_uri":process.env.AUTH_URI,
        "token_uri": process.env.TOKEN_URI,
        "auth_provider_x509_cert_url": process.env.AUTH_PROVIDER_X509_CERT_URL,
        "client_x509_cert_url": process.env.CLIENT_X509_CERT_URL,
        "universe_domain": process.env.UNIVERSE_DOMAIN
    }),
    databaseURL: "https://fivi-31d19-default-rtdb.firebaseio.com"
});

const db = admin.database();
const app = express();

//add cors
app.use(cors());


// Your server routes and logic here...
// get all data from firebase
app.get('/api/getAllData', (req, res) => {
    db.ref('/').once('value').then(function (snapshot) {
        const data = snapshot.val();
        const processedData = handleHourDifference(data.DHT);

        res.send({ DHT: processedData });
    });
});

function handleHourDifference(data) {
    const processedData = {};
    const entries = Object.entries(data);

    for (let i = 0; i < entries.length; i++) {
        const [key, entry] = entries[i];

        if (i < entries.length - 1) {
            const [nextKey, nextEntry] = entries[i + 1];

            if (isOneHourEarlier(entry.date, entry.hour, nextEntry.date, nextEntry.hour)) {
                // Adjust the date for the next entry
                nextEntry.date = entry.date;
            }
        }

        processedData[key] = entry;
    }

    return processedData;
}

function isOneHourEarlier(date1, hour1, date2, hour2) {
    // Convert date and hour to a JavaScript Date object
    const dateTime1 = new Date(`${date1} ${hour1}`);
    const dateTime2 = new Date(`${date2} ${hour2}`);

    // Calculate the time difference in milliseconds
    const timeDifference = dateTime2 - dateTime1;

    // Check if the time difference is exactly 1 hour
    return timeDifference === 60 * 60 * 1000;
}



app.get('/api/sendEmail', async (req, res) => {
    try {
        const snapshot = await db.ref('/').once('value');
        const data = snapshot.val();
        const processedData = handleHourDifference(data.DHT);

        // Create Excel workbook
        const wb = new Excel.Workbook();
        const ws = wb.addWorksheet('Sheet 1');

        // Add headers to the worksheet
        const headers = ['Date', 'Hour', 'Humidity', 'Temperature'];
        ws.addRow(headers);

        // Add data to the worksheet
        Object.values(processedData).forEach(entry => {
            const { date, hour, hum, temp } = entry;
            ws.addRow([date, hour, hum, temp]);
        });

        // Generate a buffer from the workbook
        const buffer = await wb.xlsx.writeBuffer();

        // Configure nodemailer to send emails
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL,
                pass: process.env.PASSWORD
            }
        });

        // Define email options
        const mailOptions = {
            from: process.env.EMAIL,
            to: process.env.EMAILTO,
            subject: 'Smart Sensor Data',
            text: 'Please find attached the processed data.',
            attachments: [
                {
                    filename: 'processed_data.xlsx',
                    content: buffer
                }
            ]
        };

        // Send the email
        const info = await transporter.sendMail(mailOptions);
        console.log('Email sent: ' + info.response);
        res.status(200).send('Email sent successfully');
    } catch (error) {
        console.error(error);
        res.status(500).send('Error sending email');
    }
});



app.listen(3000, () => {
    console.log('Server is running on port 3000');
});
