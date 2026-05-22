using BytexDigital.BattlEye.Rcon.Events;
using BytexDigital.BattlEye.Rcon.Requests;
using System;
using System.Net;
using System.Net.Sockets;
using System.Threading;
using System.Threading.Tasks;

namespace BytexDigital.BattlEye.Rcon
{
    public class NetworkConnection
    {
        private IPEndPoint _remoteEndpoint;
        private CancellationToken _cancellationToken;
        private UdpClient _udpClient;
        private NetworkMessageHandler _handler;
        private SequenceCounter _sequenceCounter;
        private DateTime _lastSent = new DateTime();

        public event EventHandler<string> MessageReceived;
        public event EventHandler<GenericParsedEventArgs> ProtocolEvent;
        public event EventHandler Disconnected;

        public NetworkConnection(IPEndPoint remoteEndpoint, CancellationToken cancellationToken)
        {
            _remoteEndpoint = remoteEndpoint;
            _cancellationToken = cancellationToken;
            _udpClient = new UdpClient(remoteEndpoint.AddressFamily);
            _udpClient.Connect(_remoteEndpoint);
            _handler = new NetworkMessageHandler(this);
            _sequenceCounter = new SequenceCounter();
        }

        public void BeginReceiving()
        {
            _ = ReceiveAsync();
        }

        public void BeginHeartbeat()
        {
            _ = HeartbeatAsync();
        }

        public void Send(NetworkMessage networkMessage)
        {
            _handler.Cleanup();

            if (networkMessage is SequentialNetworkRequest sequentialNetworkRequest)
            {
                sequentialNetworkRequest.SetSequenceNumber(_sequenceCounter.Next());
            }

            if (networkMessage is NetworkRequest networkRequest)
            {
                _handler.Track(networkRequest);
            }

            byte[] data = networkMessage.ToBytes();
            _udpClient.Send(data, data.Length);

            networkMessage.MarkSent();

            _lastSent = DateTime.UtcNow;
        }

        internal void FireMessageReceived(string message) => MessageReceived?.Invoke(this, message);

        internal void FireProtocolEvent(GenericParsedEventArgs args) => ProtocolEvent?.Invoke(this, args);

        private async Task ReceiveAsync()
        {
            try
            {
                var closeTask = Task.Delay(-1, _cancellationToken);

                while (!_cancellationToken.IsCancellationRequested)
                {
                    var receiveTask = _udpClient.ReceiveAsync();
                    var completedTask = await Task.WhenAny(receiveTask, closeTask).ConfigureAwait(false);

                    if (completedTask == closeTask)
                    {
                        break;
                    }

                    if (!receiveTask.IsFaulted)
                    {
                        var result = await receiveTask.ConfigureAwait(false);
                        try { _handler.Handle(result.Buffer); } catch { }
                    }
                }
            }
            catch (SocketException e)
            {
                Console.WriteLine(e.ToString());
            }
        }

        private async Task HeartbeatAsync()
        {
            while (!_cancellationToken.IsCancellationRequested)
            {
                await Task.Delay(3000).ConfigureAwait(false);

                if (_cancellationToken.IsCancellationRequested)
                {
                    return;
                }

                var keepAlivePacket = new CommandNetworkRequest("");

                Send(keepAlivePacket);
                using (var timeoutSource = new CancellationTokenSource(5000))
                {
                    bool acknowledged = await keepAlivePacket
                        .WaitUntilAcknowledgedAsync(timeoutSource.Token)
                        .ConfigureAwait(false);

                    if (!acknowledged)
                    {
                        try
                        {
                            Disconnected?.Invoke(this, new EventArgs());
                        }
                        catch { }
                    }
                }
            }
        }
    }
}
