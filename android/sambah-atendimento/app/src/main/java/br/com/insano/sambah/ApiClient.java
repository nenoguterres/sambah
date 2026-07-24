package br.com.insano.sambah;

import android.net.Uri;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

final class ApiClient {
    static final String BASE_URL = "https://api.insanofoodtruck.com.br";
    private static final int TIMEOUT_MS = 15000;

    static final class Result {
        final int status;
        final JSONObject json;
        final String cookie;

        Result(int status, JSONObject json, String cookie) {
            this.status = status;
            this.json = json;
            this.cookie = cookie;
        }

        boolean ok() {
            return status >= 200 && status < 300 && json.optBoolean("ok", false);
        }

        String error() {
            String message = json.optString("message", "");
            if (!message.isEmpty()) return message;
            String error = json.optString("error", "");
            return error.isEmpty() ? "Falha na comunicação com o SamBah" : error;
        }
    }

    static Result login(String username, String password) throws Exception {
        JSONObject body = new JSONObject();
        body.put("username", username);
        body.put("password", password);
        return request("POST", "/api/auth/login", body, "");
    }

    static Result alerts(String phone, String cookie) throws Exception {
        String path = "/api/call-center/alerts?phone=" + Uri.encode(phone) + "&unreadOnly=true";
        return request("GET", path, null, cookie);
    }

    static Result conversation(String conversationId, String cookie) throws Exception {
        return request("GET", "/api/conversas/" + Uri.encode(conversationId), null, cookie);
    }

    static Result reply(String conversationId, String text, String cookie) throws Exception {
        JSONObject body = new JSONObject();
        body.put("text", text);
        body.put("manualSendId", "android:" + conversationId + ":" + System.currentTimeMillis());
        return request("POST", "/api/conversas/" + Uri.encode(conversationId) + "/responder", body, cookie);
    }

    static Result resolve(String conversationId, long expectedVersion, String cookie) throws Exception {
        JSONObject body = new JSONObject();
        body.put("expectedVersion", expectedVersion);
        return request("POST", "/api/conversas/" + Uri.encode(conversationId) + "/resolve", body, cookie);
    }

    static Result markAlertRead(String alertId, String cookie) throws Exception {
        return request("POST", "/api/call-center/alerts/" + Uri.encode(alertId) + "/read", new JSONObject(), cookie);
    }

    private static Result request(String method, String path, JSONObject payload, String cookie) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(BASE_URL + path).openConnection();
        connection.setRequestMethod(method);
        connection.setConnectTimeout(TIMEOUT_MS);
        connection.setReadTimeout(TIMEOUT_MS);
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("User-Agent", "SamBah-Android/1.0.0");
        if (cookie != null && !cookie.isEmpty()) connection.setRequestProperty("Cookie", cookie);

        if (payload != null) {
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            byte[] bytes = payload.toString().getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(bytes.length);
            try (OutputStream output = connection.getOutputStream()) {
                output.write(bytes);
            }
        }

        int status = connection.getResponseCode();
        String setCookie = normalizeCookie(connection.getHeaderField("Set-Cookie"));
        InputStream input = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
        String raw = readAll(input);
        JSONObject json = raw.isEmpty() ? new JSONObject() : new JSONObject(raw);
        connection.disconnect();
        return new Result(status, json, setCookie);
    }

    private static String normalizeCookie(String value) {
        if (value == null || value.isEmpty()) return "";
        int separator = value.indexOf(';');
        return separator >= 0 ? value.substring(0, separator) : value;
    }

    private static String readAll(InputStream input) throws Exception {
        if (input == null) return "";
        StringBuilder text = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) text.append(line);
        }
        return text.toString().trim();
    }

    private ApiClient() {}
}
