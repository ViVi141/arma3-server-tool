using System.Collections.Generic;

namespace Arma3ServerTools.Core.Models
{
    public sealed class A3stModsFile
    {
        public List<ModsEntity> modsEntities { get; set; } = new List<ModsEntity>();
    }
}
