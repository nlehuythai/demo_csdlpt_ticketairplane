const k8s = require('@kubernetes/client-node');
const kc = new k8s.KubeConfig();

try {
    if (process.env.KUBERNETES_SERVICE_HOST) {
        kc.loadFromCluster();
    } else {
        kc.loadFromDefault();
    }
} catch (e) {
    console.error("Không thể load cấu hình K8s:", e);
}

const k8sApi = kc.makeApiClient(k8s.CoreV1Api);

exports.getNodes = async (req, res) => {
    try {
        const response = await k8sApi.listNamespacedPod('default');
        const pods = response.body.items.map(pod => ({
            name: pod.metadata.name,
            status: pod.status.phase,
            ready: pod.status.containerStatuses ? pod.status.containerStatuses[0].ready : false
        }));
        return res.json(pods);
    } catch (error) {
        console.error("Lỗi quét Pod K8s, dùng data phòng hờ chống sập:", error);
        return res.json([]);
    }
};