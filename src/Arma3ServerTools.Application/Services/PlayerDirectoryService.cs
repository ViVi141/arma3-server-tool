using System;
using System.Collections.Generic;
using Arma3ServerTools.Application.Repositories;
using Arma3ServerTools.Core.Models;
using Arma3ServerTools.Core.Repositories;
using BytexDigital.BattlEye.Rcon.Domain;

namespace Arma3ServerTools.Application.Services
{
    public sealed class PlayerDirectoryService
    {
        private readonly PlayerDatabaseRepository repository;

        public PlayerDirectoryService(PlayerDatabaseRepository repository)
        {
            this.repository = repository;
        }

        public IReadOnlyList<PlayerDB> LoadAll()
        {
            return repository.LoadAll();
        }

        public void SyncPlayers(IEnumerable<Player> players)
        {
            if (players == null)
            {
                return;
            }

            string now = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
            foreach (Player player in players)
            {
                if (player == null || string.IsNullOrWhiteSpace(player.Guid))
                {
                    continue;
                }

                string ip = string.Empty;
                if (player.RemoteEndpoint != null && player.RemoteEndpoint.Address != null)
                {
                    ip = player.RemoteEndpoint.Address.ToString();
                }

                if (repository.CountByGuid(player.Guid) > 0)
                {
                    repository.Update(player.Guid, player.Name ?? string.Empty, ip, now);
                }
                else
                {
                    repository.Insert(player.Guid, player.Name ?? string.Empty, ip, now);
                }
            }
        }
    }
}
