package br.com.insano.sambah;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.IBinder;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Collections;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

public final class AlertPollingService extends Service {
    static final String ACTION_ALERTS_UPDATED = "br.com.insano.sambah.ALERTS_UPDATED";
    private static final String SERVICE_CHANNEL = "sambah_service";
    private static final String ALERT_CHANNEL = "sambah_alerts";
    private static final int SERVICE_NOTIFICATION_ID = 100;
    private ScheduledExecutorService scheduler;

    @Override
    public void onCreate() {
        super.onCreate();
        createChannels();
        startForeground(SERVICE_NOTIFICATION_ID, serviceNotification());
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (scheduler == null || scheduler.isShutdown()) {
            scheduler = Executors.newSingleThreadScheduledExecutor();
            scheduler.scheduleWithFixedDelay(this::pollSafely, 0, 10, TimeUnit.SECONDS);
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        if (scheduler != null) scheduler.shutdownNow();
        scheduler = null;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void pollSafely() {
        try {
            SharedPreferences prefs = getSharedPreferences(MainActivity.PREFS_NAME, MODE_PRIVATE);
            String phone = prefs.getString(MainActivity.KEY_PHONE, "");
            if (phone == null || phone.isEmpty()) return;

            ApiClient.Result result = ApiClient.alerts(phone, prefs.getString(MainActivity.KEY_COOKIE, ""));
            if (result.status < 200 || result.status >= 300) return;

            JSONArray alerts = result.json.optJSONArray("alerts");
            if (alerts == null) alerts = new JSONArray();
            Set<String> previous = new HashSet<>(prefs.getStringSet(MainActivity.KEY_SEEN_ALERTS, Collections.emptySet()));
            Set<String> current = new HashSet<>();

            for (int index = 0; index < alerts.length(); index++) {
                JSONObject alert = alerts.optJSONObject(index);
                if (alert == null) continue;
                String id = alert.optString("id", "");
                if (id.isEmpty()) continue;
                String stamp = id + "|" + alert.optString("updatedAt", alert.optString("createdAt", ""));
                current.add(stamp);
                if (!previous.contains(stamp)) showAlert(alert);
            }

            prefs.edit().putStringSet(MainActivity.KEY_SEEN_ALERTS, current).apply();
            Intent refresh = new Intent(ACTION_ALERTS_UPDATED).setPackage(getPackageName());
            sendBroadcast(refresh);
        } catch (Exception ignored) {
            // A próxima consulta tenta novamente. Nenhum alerta é marcado como entregue aqui.
        }
    }

    private void showAlert(JSONObject alert) {
        String alertId = alert.optString("id", "alert");
        String conversationId = alert.optString("conversationId", "");
        String clientName = alert.optString("clientName", "Cliente WhatsApp");
        String message = alert.optString("lastMessage", alert.optString("message", "Novo atendimento"));

        Intent open = new Intent(this, MainActivity.class)
                .putExtra(MainActivity.EXTRA_ALERT_ID, alertId)
                .putExtra(MainActivity.EXTRA_CONVERSATION_ID, conversationId)
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this,
                alertId.hashCode(),
                open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification notification = new Notification.Builder(this, ALERT_CHANNEL)
                .setSmallIcon(R.drawable.ic_sambah)
                .setContentTitle(clientName)
                .setContentText(message)
                .setStyle(new Notification.BigTextStyle().bigText(message))
                .setCategory(Notification.CATEGORY_MESSAGE)
                .setContentIntent(pendingIntent)
                .setAutoCancel(true)
                .build();

        NotificationManager manager = getSystemService(NotificationManager.class);
        manager.notify(alertId.hashCode(), notification);
    }

    private Notification serviceNotification() {
        Intent open = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this,
                1,
                open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        return new Notification.Builder(this, SERVICE_CHANNEL)
                .setSmallIcon(R.drawable.ic_sambah)
                .setContentTitle("SamBah ativo")
                .setContentText("Aguardando chamadas de atendimento")
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .build();
    }

    private void createChannels() {
        NotificationManager manager = getSystemService(NotificationManager.class);
        NotificationChannel service = new NotificationChannel(
                SERVICE_CHANNEL,
                "SamBah ativo",
                NotificationManager.IMPORTANCE_LOW
        );
        service.setDescription("Mantém o recebimento de chamadas ativo");
        manager.createNotificationChannel(service);

        NotificationChannel alerts = new NotificationChannel(
                ALERT_CHANNEL,
                "Chamadas de atendimento",
                NotificationManager.IMPORTANCE_HIGH
        );
        alerts.setDescription("Alertas de clientes aguardando atendimento humano");
        alerts.enableVibration(true);
        manager.createNotificationChannel(alerts);
    }
}
